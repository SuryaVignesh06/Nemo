/**
 * NEMO — the web research layer.
 *
 * Everything the product knows that is not in a model's weights comes through
 * here: a search, the pages behind it, and the videos that teach the same
 * thing. Three rules hold the module together.
 *
 * 1. NO KEYS. Every source is a public endpoint — DuckDuckGo's HTML mirror,
 *    YouTube's own results page, Google Books, Open Library, GitHub search,
 *    arXiv. A learner should not have to register with six services before the
 *    Library page will answer them, and an operator should not have to keep
 *    six more secrets in .env alongside the model key.
 *
 * 2. NEVER FATAL. A scrape is a contract nobody signed: markup moves, hosts
 *    rate-limit, a network blinks. Every fetch here resolves to an empty list
 *    rather than throwing, because a lesson that arrives ungrounded is worth
 *    far more than a lesson that fails because a search box was slow.
 *
 * 3. BOUNDED. Every request carries a timeout and every response is read
 *    against a size cap, so a hung or enormous page cannot hold a lesson open.
 */

/** Browser-shaped, because several of these hosts serve nothing to a bare client. */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const DEFAULT_TIMEOUT_MS = 7000;
/** A search page is tens of kilobytes; anything past this is not one. */
const MAX_BYTES = 3_000_000;

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
  /** Host only, for display: "arxiv.org". */
  source: string;
}

export interface VideoResult {
  id: string;
  title: string;
  url: string;
  channel: string;
  duration: string;
  thumbnail: string;
}

/* ------------------------------------------------------------------ fetch */

/**
 * A bounded GET that resolves to null instead of throwing.
 *
 * Callers are all "enrich if you can" paths, so every failure mode — offline,
 * 403, timeout, a body that never ends — has the same meaning to them, and
 * collapsing them here keeps that decision out of every call site.
 */
async function getText(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (!res.ok || !res.body) return null;

    // Read against the cap rather than trusting content-length, which a
    // chunked response does not send at all.
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.length;
      if (total > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
  } catch {
    return null;
  }
}

async function getJson<T>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T | null> {
  const text = await getText(url, timeoutMs);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ HTML */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  nbsp: ' ',
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    const key = body.toLowerCase();
    if (ENTITIES[key]) return ENTITIES[key];
    if (key.startsWith('#x')) {
      const code = parseInt(key.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (key.startsWith('#')) {
      const code = parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

/** Tags out, entities decoded, whitespace collapsed. */
export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'ref_src']);
const SEARCH_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'for', 'from', 'how', 'in', 'is', 'of', 'on', 'or', 'the', 'to', 'what', 'when', 'why', 'with',
]);

/** Canonical public URL used for deduplication and safe page fetching. */
export function canonicalPublicUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    const ipv6Host = host.replace(/^\[|\]$/g, '');
    const isIpv6Literal = /^[0-9a-f:]+$/i.test(ipv6Host) && ipv6Host.includes(':');
    if (
      host === 'localhost' || host.endsWith('.local') ||
      /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      ipv6Host === '::1' || (isIpv6Literal && /^(fc|fd)/i.test(ipv6Host))
    ) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/$/, '');
    return url.toString();
  } catch {
    return null;
  }
}

function relevanceScore(result: WebResult, query: string): number {
  const terms = query.toLowerCase().split(/[^a-z0-9+#.-]+/).filter((term) => term.length > 1 && !SEARCH_STOP_WORDS.has(term));
  const title = result.title.toLowerCase();
  const snippet = result.snippet.toLowerCase();
  const host = result.source.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += 6;
    if (snippet.includes(term)) score += 2;
    if (host.includes(term)) score += 2;
  }
  if (/\.(gov|edu)$/.test(host) || /(^|\.)(docs|developer|support)\./.test(host)) score += 3;
  if (/pinterest|facebook|instagram|tiktok/.test(host)) score -= 8;
  return score;
}

/** Relevance-ranked, canonical and domain-diverse results. */
export function rankWebResults(items: WebResult[], query: string, limit: number): WebResult[] {
  const unique = new Map<string, WebResult>();
  for (const item of items) {
    const url = canonicalPublicUrl(item.url);
    if (!url || !item.title.trim()) continue;
    const canonical = { ...item, url, source: hostOf(url) };
    const previous = unique.get(url);
    if (!previous || relevanceScore(canonical, query) > relevanceScore(previous, query)) unique.set(url, canonical);
  }
  const ranked = [...unique.values()].sort((a, b) => relevanceScore(b, query) - relevanceScore(a, query));
  const domains = new Map<string, number>();
  return ranked.filter((item) => {
    const count = domains.get(item.source) ?? 0;
    if (count >= 2) return false;
    domains.set(item.source, count + 1);
    return true;
  }).slice(0, limit);
}

/**
 * DuckDuckGo wraps every outbound link in a redirect carrying the real target
 * in `uddg`. Unwrapped here so the UI shows — and the crawler follows — the
 * page itself rather than the tracker.
 */
function unwrapDuckLink(href: string): string {
  const raw = href.startsWith('//') ? `https:${href}` : href;
  try {
    const url = new URL(raw, 'https://duckduckgo.com');
    const target = url.searchParams.get('uddg');
    return target ?? url.toString();
  } catch {
    return raw;
  }
}

/* ---------------------------------------------------------------- search */

/**
 * A web search, from DuckDuckGo's no-JavaScript mirrors.
 *
 * Two endpoints are tried because they fail independently: the `html` mirror
 * carries snippets and is the one worth having, and `lite` is a much smaller
 * page that tends to still answer when the first is rate-limiting.
 */
export async function searchWeb(query: string, limit = 6): Promise<WebResult[]> {
  const q = encodeURIComponent(query.trim());
  if (!q) return [];

  const [html, lite] = await Promise.all([
    getText(`https://html.duckduckgo.com/html/?q=${q}`),
    getText(`https://lite.duckduckgo.com/lite/?q=${q}`),
  ]);
  return rankWebResults([
    ...(html ? parseDuckHtml(html) : []),
    ...(lite ? parseDuckLite(lite) : []),
  ], query, limit);
}

function parseDuckHtml(html: string): WebResult[] {
  const out: WebResult[] = [];
  const seen = new Set<string>();
  // Each result is an anchor carrying the title, then a snippet block. The
  // snippet is matched from the remainder of the same record rather than by a
  // second global pass, so a missing snippet cannot shift every later pairing.
  const blocks = html.split(/<div[^>]+class="[^"]*\bresult\b[^"]*"/i).slice(1);
  for (const block of blocks) {
    const link = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(
      block
    );
    if (!link) continue;
    const url = unwrapDuckLink(link[1]);
    if (!/^https?:/i.test(url) || seen.has(url)) continue;
    const snippet = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    seen.add(url);
    out.push({
      title: stripTags(link[2]),
      url,
      snippet: snippet ? stripTags(snippet[1]) : '',
      source: hostOf(url),
    });
  }
  return out;
}

function parseDuckLite(html: string): WebResult[] {
  const out: WebResult[] = [];
  const seen = new Set<string>();
  const re = /<a[^>]+class="[^"]*result-link[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const url = unwrapDuckLink(m[1]);
    if (!/^https?:/i.test(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({ title: stripTags(m[2]), url, snippet: '', source: hostOf(url) });
  }
  return out;
}

/**
 * The readable text of one page.
 *
 * Deliberately crude — tags out, whitespace collapsed, truncated. This feeds a
 * model as grounding, not a reader, so boilerplate costs a few tokens rather
 * than breaking anything, and a real extractor would be a dependency and a
 * second failure mode for very little gain at this size.
 */
export async function fetchReadable(url: string, maxChars = 2400): Promise<string> {
  const safeUrl = canonicalPublicUrl(url);
  if (!safeUrl) return '';
  const html = await getText(safeUrl, 6000);
  if (!html) return '';
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  const main = (body ? body[1] : html)
    .replace(/<(header|nav|footer|aside|form|dialog)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+(?:cookie|consent|newsletter|advert)[^>]*>[\s\S]*?<\/[^>]+>/gi, ' ');
  return stripTags(main).slice(0, maxChars);
}

/**
 * Search, then read the top pages in parallel.
 *
 * The snippets alone are often a sentence fragment each; the opening of the
 * page behind them is what actually grounds an explanation.
 */
export async function crawl(
  query: string,
  { results = 5, read = 3 } = {}
): Promise<{ results: WebResult[]; pages: Array<{ url: string; title: string; text: string }> }> {
  const found = await searchWeb(query, results);
  const readCandidates: WebResult[] = [];
  const readHosts = new Set<string>();
  for (const item of found) {
    if (readHosts.has(item.source)) continue;
    readHosts.add(item.source);
    readCandidates.push(item);
    if (readCandidates.length >= read) break;
  }
  const pages = await Promise.all(
    readCandidates.map(async (r) => ({
      url: r.url,
      title: r.title,
      text: await fetchReadable(r.url),
    }))
  );
  return { results: found, pages: pages.filter((p) => p.text.length > 200) };
}

/* --------------------------------------------------------------- YouTube */

/**
 * YouTube search, read out of the results page's own bootstrap payload.
 *
 * The page ships its results as a JSON blob assigned to `ytInitialData`, which
 * is both far easier to read than the rendered markup and far more stable
 * against restyling. `videoRenderer` nodes are collected wherever they appear
 * rather than by walking the exact shelf layout, which changes constantly.
 */
export async function searchYouTube(query: string, limit = 3): Promise<VideoResult[]> {
  const q = encodeURIComponent(query.trim());
  if (!q) return [];
  // sp=EgIQAQ%3D%3D restricts to videos, so playlists and channels do not take
  // the slots.
  const html = await getText(`https://www.youtube.com/results?search_query=${q}&sp=EgIQAQ%253D%253D`);
  if (!html) return [];

  const data = extractYtInitialData(html);
  if (!data) return [];

  const videos: VideoResult[] = [];
  const seen = new Set<string>();
  const visit = (node: unknown): void => {
    if (videos.length >= limit || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const record = node as Record<string, unknown>;
    const renderer = record.videoRenderer as Record<string, unknown> | undefined;
    if (renderer && typeof renderer.videoId === 'string') {
      const id = renderer.videoId;
      const title = runsText(renderer.title);
      if (id && title && !seen.has(id)) {
        seen.add(id);
        videos.push({
          id,
          title,
          url: `https://www.youtube.com/watch?v=${id}`,
          channel: runsText(renderer.ownerText) || runsText(renderer.longBylineText),
          duration: runsText(renderer.lengthText),
          // i.ytimg.com serves this without the results page around it.
          thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        });
      }
    }
    for (const value of Object.values(record)) visit(value);
  };
  visit(data);
  return videos;
}

/**
 * The `ytInitialData` object, taken by brace matching rather than by regex.
 *
 * The payload contains every bracket character imaginable inside strings, so a
 * non-greedy match to the first `};` truncates it mid-object. Counting braces
 * outside of string literals is the only way to find the real end.
 */
function extractYtInitialData(html: string): unknown {
  const marker = 'var ytInitialData = ';
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = at + marker.length;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** YouTube writes every label as either `simpleText` or an array of `runs`. */
function runsText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const record = node as Record<string, unknown>;
  if (typeof record.simpleText === 'string') return record.simpleText;
  if (Array.isArray(record.runs)) {
    return record.runs
      .map((run) => (run && typeof run === 'object' ? String((run as { text?: string }).text ?? '') : ''))
      .join('')
      .trim();
  }
  return '';
}

export { getJson, getText, hostOf };
