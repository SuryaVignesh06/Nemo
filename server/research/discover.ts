/**
 * NEMO — Library discovery.
 *
 * The Library page asks one question — "what is there on this?" — of four
 * different worlds, and each world has a public catalogue that answers it
 * properly. Rather than web-search all four and hope the parse holds, each
 * kind goes to the index that actually knows:
 *
 *   books    Open Library, for the catalogue, the free scans and the community
 *            rating, with Google Books layered on for price and shop.
 *   repos    the GitHub search API.
 *   papers   arXiv first (the full PDF is free), Crossref behind it (which
 *            knows the journals arXiv does not).
 *   docs     a plain web search, because documentation has no one index.
 *
 * The book rule is the one the brief is specific about: if a soft copy exists,
 * link the reader straight to it; if it does not, show what the book costs,
 * how it is rated and where it is sold — so the answer is useful either way,
 * and never pretends a paywalled book is free.
 *
 * Every source fails soft (see research/web.ts): a dead index returns no rows
 * rather than an error page.
 */

import { getJson, getText, searchWeb, stripTags, type WebResult } from './web.ts';

export type DiscoveryKind = 'books' | 'repos' | 'papers' | 'docs';

export const DISCOVERY_KINDS: readonly DiscoveryKind[] = ['books', 'repos', 'papers', 'docs'];

export interface DiscoveryItem {
  kind: DiscoveryKind;
  /** Stable enough to use as a React key within one result set. */
  id: string;
  title: string;
  /** Author list, repo owner, or the host a document sits on. */
  byline: string;
  description: string;
  /** Where clicking the card goes: the free copy when there is one. */
  url: string;
  /** Cover, avatar or thumbnail. */
  image?: string;
  /** Facts worth a chip: stars, year, language, rating, price. */
  facts: string[];
  /** Set when the whole text is readable free of charge. */
  freeUrl?: string;
  /** Set when it is for sale: "₹499", "$38.00". */
  price?: string;
  /** 0-5, when the catalogue has one. */
  rating?: number;
  /** The shop or host the item lives on: "Google Play Books", "github.com". */
  source: string;
}

export interface DiscoveryResponse {
  kind: DiscoveryKind;
  query: string;
  items: DiscoveryItem[];
}

export function parseKind(value: unknown): DiscoveryKind {
  return DISCOVERY_KINDS.includes(value as DiscoveryKind) ? (value as DiscoveryKind) : 'docs';
}

export async function discover(query: string, kind: DiscoveryKind): Promise<DiscoveryResponse> {
  const q = query.trim();
  if (!q) return { kind, query: q, items: [] };
  const items =
    kind === 'books'
      ? await findBooks(q)
      : kind === 'repos'
        ? await findRepos(q)
        : kind === 'papers'
          ? await findPapers(q)
          : await findDocs(q);
  return { kind, query: q, items };
}

/* ----------------------------------------------------------------- books */

interface GoogleVolume {
  id: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    description?: string;
    publishedDate?: string;
    pageCount?: number;
    categories?: string[];
    averageRating?: number;
    ratingsCount?: number;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    infoLink?: string;
    previewLink?: string;
  };
  saleInfo?: {
    saleability?: string;
    buyLink?: string;
    listPrice?: { amount?: number; currencyCode?: string };
    retailPrice?: { amount?: number; currencyCode?: string };
  };
  accessInfo?: {
    pdf?: { isAvailable?: boolean; downloadLink?: string };
    epub?: { isAvailable?: boolean; downloadLink?: string };
    webReaderLink?: string;
    publicDomain?: boolean;
    accessViewStatus?: string;
  };
}

interface OpenLibraryDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  /** Internet Archive identifiers — the free scan, when one exists. */
  ia?: string[];
  ebook_access?: string;
  ratings_average?: number;
  ratings_count?: number;
  isbn?: string[];
  number_of_pages_median?: number;
  publisher?: string[];
}

const CURRENCY: Record<string, string> = {
  USD: '$',
  INR: '₹',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  AUD: 'A$',
  CAD: 'C$',
};

function money(amount?: number, code?: string): string | undefined {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return undefined;
  const symbol = code ? (CURRENCY[code] ?? `${code} `) : '';
  return `${symbol}${amount.toFixed(2).replace(/\.00$/, '')}`;
}

/** Loose match: the two catalogues punctuate and subtitle titles differently. */
function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
}

/**
 * Books, from Open Library with Google Books layered on top.
 *
 * Open Library leads because it always answers: it needs no key and has no
 * quota, it knows which books have a free scan at the Internet Archive, and it
 * carries its own community ratings. Google Books is the enrichment pass — it
 * is the one that knows the price and the shop — but its keyless quota is a
 * single pool shared by every anonymous caller on earth, so on any given day
 * it may return nothing at all. Depending on it for the catalogue itself
 * meant an empty Library page whenever that pool ran dry.
 *
 * What a row can therefore promise is: always a title, an author and a cover;
 * a free link whenever one exists; a rating whenever either source has one;
 * and a price only when Google actually quoted one. A book with no known price
 * says "find in stores" and links to a search — it never invents a number.
 */
async function findBooks(query: string): Promise<DiscoveryItem[]> {
  const [openLibrary, google] = await Promise.all([
    openLibrarySearch(query),
    getJson<{ items?: GoogleVolume[] }>(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=20&printType=books`,
      8000
    ),
  ]);

  /* Google volumes indexed by title, so an Open Library row can pick up the
     price and the shop when the same book is in both. */
  const byTitle = new Map<string, GoogleVolume>();
  for (const volume of google?.items ?? []) {
    const title = volume.volumeInfo?.title;
    if (title && !byTitle.has(titleKey(title))) byTitle.set(titleKey(title), volume);
  }

  const items: DiscoveryItem[] = [];
  const used = new Set<string>();

  for (const doc of openLibrary?.docs ?? []) {
    if (!doc.title) continue;
    const key = titleKey(doc.title);
    const volume = byTitle.get(key);
    if (volume) used.add(key);
    items.push(bookItem(doc, volume));
  }

  // Volumes Open Library did not have at all.
  for (const volume of google?.items ?? []) {
    const title = volume.volumeInfo?.title;
    if (!title || used.has(titleKey(title))) continue;
    used.add(titleKey(title));
    items.push(bookItem(undefined, volume));
  }

  return items.slice(0, 24);
}

const OL_FIELDS =
  'key,title,author_name,first_publish_year,cover_i,ia,ebook_access,ratings_average,ratings_count,isbn,number_of_pages_median,publisher';

/**
 * Open Library search, widened when the phrase is too specific.
 *
 * Its default is an AND over every term, so a natural subject line like
 * "esp32 embedded systems" matches almost nothing while "esp32" alone matches
 * plenty. When the precise phrase comes back thin the longest term — the one
 * carrying the meaning — is tried on its own, and the two are merged with the
 * precise matches kept in front.
 */
async function openLibrarySearch(query: string): Promise<{ docs?: OpenLibraryDoc[] }> {
  const url = (q: string) =>
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=20&fields=${OL_FIELDS}`;

  const exact = await getJson<{ docs?: OpenLibraryDoc[] }>(url(query), 9000);
  const docs = exact?.docs ?? [];
  if (docs.length >= 6) return { docs };

  const terms = query.split(/\s+/).filter((word) => word.length > 2);
  const widest = terms.slice().sort((a, b) => b.length - a.length)[0];
  if (!widest || widest.toLowerCase() === query.trim().toLowerCase()) return { docs };

  const loose = await getJson<{ docs?: OpenLibraryDoc[] }>(url(widest), 9000);
  const seen = new Set(docs.map((doc) => doc.key));
  for (const doc of loose?.docs ?? []) {
    if (doc.key && !seen.has(doc.key)) {
      seen.add(doc.key);
      docs.push(doc);
    }
  }
  return { docs };
}

/** One row, from whichever of the two catalogues had the book. */
function bookItem(doc?: OpenLibraryDoc, volume?: GoogleVolume): DiscoveryItem {
  const info = volume?.volumeInfo ?? {};
  const sale = volume?.saleInfo ?? {};
  const access = volume?.accessInfo ?? {};

  const title = doc?.title ?? info.title ?? '';
  const isbn = doc?.isbn?.[0];

  /* A free copy, in order of how good the link is: an Internet Archive scan,
     then a public-domain download from Google. `borrowable` is included and
     labelled as such — it is free to read, with a queue. */
  const archiveId = doc?.ia?.[0];
  const archiveFree =
    archiveId && (doc?.ebook_access === 'public' || doc?.ebook_access === 'borrowable')
      ? `https://archive.org/details/${archiveId}`
      : undefined;
  const googleFree =
    access.publicDomain || access.accessViewStatus === 'FULL_PUBLIC_DOMAIN'
      ? (access.pdf?.downloadLink ?? access.epub?.downloadLink ?? access.webReaderLink ?? undefined)
      : undefined;
  const freeUrl = archiveFree ?? googleFree;

  const price = money(
    sale.retailPrice?.amount ?? sale.listPrice?.amount,
    sale.retailPrice?.currencyCode ?? sale.listPrice?.currencyCode
  );

  // Open Library's rating first: it is the one that is actually there.
  const rating = doc?.ratings_average ?? info.averageRating;
  const ratingCount = doc?.ratings_count ?? info.ratingsCount;

  /* Where to buy, when there is no free copy. A Google buy link is a real
     product page; otherwise the honest answer is a store search by ISBN,
     labelled as a search rather than dressed up as a price. */
  const buyUrl =
    sale.buyLink ??
    info.infoLink ??
    (isbn ? `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(isbn)}` : undefined);

  const facts: string[] = [];
  const year = doc?.first_publish_year ?? Number(info.publishedDate?.slice(0, 4));
  if (year) facts.push(String(year));
  const pages = doc?.number_of_pages_median ?? info.pageCount;
  if (pages) facts.push(`${pages} pages`);
  if (typeof rating === 'number' && rating > 0) {
    facts.push(`★ ${rating.toFixed(1)}${ratingCount ? ` (${ratingCount})` : ''}`);
  }
  if (freeUrl) {
    facts.push(doc?.ebook_access === 'borrowable' && !googleFree ? 'Free to borrow' : 'Free full text');
  } else if (!price && buyUrl) {
    facts.push('Find in stores');
  }

  const cover = doc?.cover_i
    ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
    : (info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail)?.replace(/^http:/, 'https:');

  return {
    kind: 'books',
    id: doc?.key ?? volume?.id ?? title,
    title: !doc && info.subtitle ? `${title}: ${info.subtitle}` : title,
    byline: (doc?.author_name ?? info.authors ?? []).join(', '),
    description: (info.description ?? '').slice(0, 320),
    // The free copy wins the click; otherwise the shop does.
    url: freeUrl ?? buyUrl ?? (doc?.key ? `https://openlibrary.org${doc.key}` : ''),
    image: cover,
    facts,
    freeUrl,
    price: freeUrl ? undefined : price,
    rating: typeof rating === 'number' && rating > 0 ? rating : undefined,
    source: freeUrl
      ? archiveFree
        ? 'archive.org'
        : 'Google Books'
      : sale.buyLink
        ? 'Google Play Books'
        : doc
          ? 'openlibrary.org'
          : 'Google Books',
  };
}

/* ----------------------------------------------------------------- repos */

interface GithubRepo {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  pushed_at: string;
  owner?: { avatar_url?: string };
  license?: { spdx_id?: string } | null;
}

async function findRepos(query: string): Promise<DiscoveryItem[]> {
  const data = await getJson<{ items?: GithubRepo[] }>(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=18`,
    8000
  );
  return (data?.items ?? []).map((repo) => ({
    kind: 'repos' as const,
    id: String(repo.id),
    title: repo.full_name,
    byline: repo.language ?? '',
    description: repo.description ?? '',
    url: repo.html_url,
    image: repo.owner?.avatar_url,
    facts: [
      `★ ${repo.stargazers_count.toLocaleString()}`,
      `${repo.forks_count.toLocaleString()} forks`,
      ...(repo.language ? [repo.language] : []),
      ...(repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION'
        ? [repo.license.spdx_id]
        : []),
      `updated ${repo.pushed_at.slice(0, 10)}`,
    ],
    freeUrl: repo.html_url,
    source: 'github.com',
  }));
}

/* ---------------------------------------------------------------- papers */

async function findPapers(query: string): Promise<DiscoveryItem[]> {
  const [arxiv, crossref] = await Promise.all([findArxiv(query), findCrossref(query)]);
  // arXiv first: those come with a free PDF attached.
  return [...arxiv, ...crossref].slice(0, 20);
}

async function findArxiv(query: string): Promise<DiscoveryItem[]> {
  const xml = await getText(
    `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=10&sortBy=relevance`,
    9000
  );
  if (!xml) return [];

  const items: DiscoveryItem[] = [];
  // Atom, read with a scanner rather than an XML dependency: the shape here is
  // fixed and shallow, and every field is optional-safe below.
  for (const block of xml.split('<entry>').slice(1)) {
    const pick = (tag: string) => {
      const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(block);
      return m ? stripTags(m[1]) : '';
    };
    const id = pick('id');
    const title = pick('title');
    if (!id || !title) continue;
    const authors = [...block.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => stripTags(m[1]));
    const published = pick('published').slice(0, 10);
    const pdf = /<link[^>]+title="pdf"[^>]+href="([^"]+)"/.exec(block)?.[1] ?? id.replace('/abs/', '/pdf/');
    const category = /<category[^>]+term="([^"]+)"/.exec(block)?.[1] ?? '';
    items.push({
      kind: 'papers',
      id,
      title,
      byline: authors.slice(0, 4).join(', ') + (authors.length > 4 ? ' et al.' : ''),
      description: pick('summary').slice(0, 320),
      url: pdf,
      facts: [...(published ? [published] : []), ...(category ? [category] : []), 'Free PDF'],
      freeUrl: pdf,
      source: 'arxiv.org',
    });
  }
  return items;
}

interface CrossrefWork {
  DOI: string;
  title?: string[];
  author?: Array<{ given?: string; family?: string }>;
  abstract?: string;
  'container-title'?: string[];
  issued?: { 'date-parts'?: number[][] };
  URL?: string;
  is_referenced_by_count?: number;
}

async function findCrossref(query: string): Promise<DiscoveryItem[]> {
  const data = await getJson<{ message?: { items?: CrossrefWork[] } }>(
    `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=10&select=DOI,title,author,abstract,container-title,issued,URL,is-referenced-by-count`,
    8000
  );
  return (data?.message?.items ?? [])
    .filter((work) => work.title?.[0])
    .map((work) => ({
      kind: 'papers' as const,
      id: work.DOI,
      title: stripTags(work.title![0]),
      byline: (work.author ?? [])
        .slice(0, 4)
        .map((a) => [a.given, a.family].filter(Boolean).join(' '))
        .join(', '),
      description: work.abstract ? stripTags(work.abstract).slice(0, 320) : '',
      url: work.URL ?? `https://doi.org/${work.DOI}`,
      facts: [
        ...(work.issued?.['date-parts']?.[0]?.[0] ? [String(work.issued['date-parts'][0][0])] : []),
        ...(work['container-title']?.[0] ? [work['container-title'][0]] : []),
        ...(work.is_referenced_by_count ? [`${work.is_referenced_by_count} citations`] : []),
      ],
      source: 'doi.org',
    }));
}

/* ------------------------------------------------------------------ docs */

async function findDocs(query: string): Promise<DiscoveryItem[]> {
  const results = await searchWeb(`${query} documentation OR guide OR tutorial`, 14);
  return results.map(toDoc);
}

function toDoc(result: WebResult, index: number): DiscoveryItem {
  return {
    kind: 'docs',
    id: `${index}-${result.url}`,
    title: result.title,
    byline: result.source,
    description: result.snippet,
    url: result.url,
    facts: [],
    freeUrl: result.url,
    source: result.source,
  };
}
