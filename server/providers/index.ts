/**
 * NEMO — LLM provider abstraction.
 *
 * Z.AI is the primary brain. OpenRouter and Gemini are alternates so a demo
 * machine can use whichever key it has. The mock provider is deterministic and
 * must be selected explicitly — it never stands in for a failed live provider
 * (registry: REJECT_UNRELATED_FALLBACK).
 *
 * Keys arrive per-request from the browser's config panel, or from the process
 * environment. They are never logged and never sent to the client.
 *
 * Reliability (brief section 26) lives here rather than in the pipeline, so
 * every agent gets it for free:
 *
 *   - Chat completions are STREAMED. A 100-second request that emits nothing
 *     is indistinguishable from a hang; a streamed one reports progress and,
 *     crucially, keeps its partial text when something goes wrong.
 *   - A reply stopped at the token limit is CONTINUED, not discarded. This is
 *     the single change that turns "the model failed" into a finished lesson:
 *     a long visual plan legitimately exceeds one response.
 *   - Transient failures retry with backoff, and an exhausted model falls back
 *     to an alternate — announced, never silently.
 */

import { LessonError, type FailureCode } from '../../shared/contracts.ts';
import { normalizeChatResponse, stripThinkTags, type ChatResponse } from './normalize.ts';

export type ProviderName = 'zai' | 'openrouter' | 'gemini' | 'mock';

export interface ProviderConfig {
  provider: ProviderName;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface CompleteOptions {
  system: string;
  user: string;
  /**
   * Base64-encoded PNG frames for a vision-capable model. Used by the Visual
   * Critic so it judges the render rather than the JSON. Providers that cannot
   * accept images ignore these; the critic is told when no frames were sent.
   */
  images?: string[];
  /** Ask the provider for a JSON object when it supports the flag. */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /**
   * Streamed text as it arrives. `total` is the running character count, which
   * is what the UI shows so a long generation visibly progresses.
   */
  onDelta?(chunk: string, total: number): void;
  /** Recovery steps worth telling the user about (continuations, retries). */
  onNotice?(note: string): void;
  /**
   * How many continuation requests may follow a reply that stopped at the
   * token limit. Each one resumes from the partial text rather than restarting.
   */
  maxContinuations?: number;
  /** Set false to force a single non-streamed request (used by tests). */
  stream?: boolean;
}

export interface LLMProvider {
  readonly name: ProviderName;
  readonly model: string;
  complete(opts: CompleteOptions): Promise<string>;
}

export type ModelPriceFilter = 'all' | 'free' | 'paid';
export type ModelSort =
  | 'name-asc'
  | 'name-desc'
  | 'context-high-to-low'
  | 'context-low-to-high'
  | 'pricing-low-to-high'
  | 'pricing-high-to-low'
  | 'newest';

export interface ModelPricing {
  /** OpenRouter publishes prices in US dollars per token/unit. */
  currency: 'USD';
  prompt?: number;
  completion?: number;
  request?: number;
  image?: number;
  webSearch?: number;
  internalReasoning?: number;
  inputCacheRead?: number;
  inputCacheWrite?: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: ProviderName;
  description?: string;
  contextLength?: number;
  maxOutputTokens?: number;
  inputModalities: string[];
  outputModalities: string[];
  /** Provider-native feature/parameter names, not capabilities guessed from the ID. */
  capabilities: string[];
  supportedParameters?: string[];
  supportedGenerationMethods?: string[];
  pricing?: ModelPricing;
  /** `unknown` is intentional when a discovery endpoint publishes no pricing. */
  pricingTier: 'free' | 'paid' | 'unknown';
  /** Compatibility field for existing clients. Null means the provider did not say. */
  isFree: boolean | null;
  createdAt?: number;
  version?: string;
  baseModelId?: string;
}

export interface ListModelsOptions {
  filter?: ModelPriceFilter;
  search?: string;
  sort?: ModelSort;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ProviderHealth {
  provider: ProviderName;
  ok: boolean;
  status: 'healthy' | 'unhealthy' | 'unsupported';
  latencyMs: number;
  modelCount?: number;
  message?: string;
}

/** A generation provider that also owns discovery and non-billable health checks. */
export interface ModelProvider extends LLMProvider {
  listModels(opts?: ListModelsOptions): Promise<ModelInfo[]>;
  healthCheck(opts?: Pick<ListModelsOptions, 'timeoutMs' | 'signal'>): Promise<ProviderHealth>;
}

const DEFAULT_MODELS: Record<ProviderName, string> = {
  zai: 'glm-4.6',
  openrouter: 'openai/gpt-4o-mini',
  gemini: 'gemini-2.5-flash',
  mock: 'deterministic-mock',
};

const DEFAULT_BASE_URLS: Record<string, string> = {
  zai: 'https://api.z.ai/api/paas/v4',
  openrouter: 'https://openrouter.ai/api/v1',
};

const DEFAULT_TIMEOUT_MS = 90_000;
/** A stream that has gone this long without a byte is considered dead. */
const STREAM_IDLE_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_CONTINUATIONS = 3;

/** Failures worth another attempt: the request itself was not the problem. */
const RETRYABLE: ReadonlySet<FailureCode> = new Set<FailureCode>([
  'RATE_LIMIT',
  'UNAVAILABLE',
  'TIMEOUT',
  'EMPTY_RESPONSE',
]);

/** Map transport and HTTP status into the explicit failure taxonomy. */
function mapHttpError(status: number, body: string, provider: string): LessonError {
  const snippet = body.slice(0, 300);

  /*
   * Aggregators report upstream congestion with the wrong status.
   *
   * OpenRouter returns HTTP 400 carrying "Upstream error from Nvidia: Service
   * temporarily overloaded" — a transient condition dressed as a permanent
   * one. Taken at face value it is INVALID_RESPONSE, which is not retried, so
   * a busy free model fails the whole lesson instead of waiting a moment.
   * The body, not the status, is the reliable signal here.
   */
  if (/overloaded|capacity|temporarily unavailable|try again|rate.?limit|too many requests|busy/i.test(body)) {
    return new LessonError(
      'RATE_LIMIT',
      `${provider} is temporarily overloaded (HTTP ${status}). Free models are often busy — retrying.`,
      [snippet]
    );
  }

  if (status === 401 || status === 403) {
    return new LessonError(
      'MISSING_CREDENTIALS',
      `${provider} rejected the API key (HTTP ${status}). Check the key in the config panel.`,
      [snippet]
    );
  }
  if (status === 429) {
    return new LessonError('RATE_LIMIT', `${provider} rate limit reached. Wait and retry.`, [snippet]);
  }
  if (status === 404) {
    return new LessonError(
      'UNSUPPORTED',
      `${provider} does not have model available (HTTP 404). Pick another in the config panel.`,
      [snippet]
    );
  }
  if (status >= 500) {
    return new LessonError('UNAVAILABLE', `${provider} is unavailable (HTTP ${status}).`, [snippet]);
  }
  return new LessonError('INVALID_RESPONSE', `${provider} returned HTTP ${status}.`, [snippet]);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  provider: string,
  external?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  external?.addEventListener('abort', onExternalAbort);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (external?.aborted) {
      throw new LessonError('STALE_REQUEST', 'Request superseded by a newer question.');
    }
    if ((err as Error).name === 'AbortError') {
      throw new LessonError('TIMEOUT', `${provider} did not respond within ${timeoutMs / 1000}s.`);
    }
    throw new LessonError('UNAVAILABLE', `Could not reach ${provider}: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onExternalAbort);
  }
}

const MODEL_DISCOVERY_TIMEOUT_MS = 10_000;
const MAX_MODEL_DISCOVERY_TIMEOUT_MS = 30_000;

function discoveryTimeout(requested: number | undefined): number {
  if (!Number.isFinite(requested)) return MODEL_DISCOVERY_TIMEOUT_MS;
  return Math.min(MAX_MODEL_DISCOVERY_TIMEOUT_MS, Math.max(1, Math.trunc(requested!)));
}

async function readProviderJson(res: Response, provider: string): Promise<unknown> {
  try {
    return await res.json();
  } catch (err) {
    throw new LessonError('INVALID_RESPONSE', `${provider} returned malformed model metadata.`, [
      (err as Error).message,
    ]);
  }
}

function modelPrice(model: ModelInfo): number | undefined {
  const prompt = model.pricing?.prompt;
  const completion = model.pricing?.completion;
  if (prompt === undefined && completion === undefined) return undefined;
  return (prompt ?? 0) + (completion ?? 0);
}

function applyModelQuery(items: ModelInfo[], opts: ListModelsOptions): ModelInfo[] {
  const filter = opts.filter ?? 'all';
  const query = opts.search?.trim().toLocaleLowerCase() ?? '';
  let models = items.filter((item) => {
    if (filter !== 'all' && item.pricingTier !== filter) return false;
    if (!query) return true;
    return `${item.name}\n${item.id}\n${item.description ?? ''}`
      .toLocaleLowerCase()
      .includes(query);
  });

  const sort = opts.sort ?? 'name-asc';
  const compareOptional = (
    a: number | undefined,
    b: number | undefined,
    direction: 1 | -1
  ): number => {
    if (a === undefined) return b === undefined ? 0 : 1;
    if (b === undefined) return -1;
    return direction * (a - b);
  };
  models = [...models].sort((a, b) => {
    switch (sort) {
      case 'name-desc':
        return b.name.localeCompare(a.name) || b.id.localeCompare(a.id);
      case 'context-high-to-low':
        return compareOptional(a.contextLength, b.contextLength, -1) || a.name.localeCompare(b.name);
      case 'context-low-to-high':
        return compareOptional(a.contextLength, b.contextLength, 1) || a.name.localeCompare(b.name);
      case 'pricing-low-to-high':
        return compareOptional(modelPrice(a), modelPrice(b), 1) || a.name.localeCompare(b.name);
      case 'pricing-high-to-low':
        return compareOptional(modelPrice(a), modelPrice(b), -1) || a.name.localeCompare(b.name);
      case 'newest':
        return compareOptional(a.createdAt, b.createdAt, -1) || a.name.localeCompare(b.name);
      case 'name-asc':
      default:
        return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    }
  });
  return models;
}

async function checkDiscoveredModels(
  provider: ProviderName,
  list: () => Promise<ModelInfo[]>
): Promise<ProviderHealth> {
  const started = performance.now();
  try {
    const models = await list();
    return {
      provider,
      ok: true,
      status: 'healthy',
      latencyMs: Math.round(performance.now() - started),
      modelCount: models.length,
    };
  } catch (err) {
    const message = err instanceof LessonError ? err.message : 'Provider health check failed.';
    return {
      provider,
      ok: false,
      status: 'unhealthy',
      latencyMs: Math.round(performance.now() - started),
      message,
    };
  }
}

/* ----------------------------------------------------------- streaming */

export interface StreamResult {
  /** Text from the content channel, in arrival order. */
  content: string;
  /** Text the model emitted as reasoning, kept as a last-resort fallback. */
  reasoning: string;
  finishReason?: string;
}

/** One SSE `data:` payload from an OpenAI-compatible stream. */
interface StreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning?: string | null;
      reasoning_content?: string | null;
    } | null;
    finish_reason?: string | null;
    native_finish_reason?: string | null;
  }> | null;
  error?: { message?: string; code?: number | string } | null;
}

/**
 * Read an OpenAI-compatible SSE stream to completion.
 *
 * The timeout here is an *idle* timeout, reset on every byte: a model steadily
 * emitting a long plan is working, and cutting it off at a fixed wall clock is
 * exactly what made long lessons unreachable.
 */
export async function readSseStream(
  res: Response,
  provider: string,
  idleMs: number,
  onDelta: ((chunk: string, total: number) => void) | undefined,
  runningTotal: number,
  external: AbortSignal | undefined
): Promise<StreamResult> {
  const body = res.body;
  if (!body) throw new LessonError('EMPTY_RESPONSE', `${provider} returned no stream body.`);

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let reasoning = '';
  let finishReason: string | undefined;
  let total = runningTotal;

  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let idled = false;
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idled = true;
      void reader.cancel().catch(() => {});
    }, idleMs);
  };
  const onExternalAbort = () => void reader.cancel().catch(() => {});
  external?.addEventListener('abort', onExternalAbort);
  resetIdle();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdle();
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line; keep the trailing partial.
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        for (const rawLine of event.split('\n')) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;

          let chunk: StreamChunk;
          try {
            chunk = JSON.parse(payload) as StreamChunk;
          } catch {
            continue; // Keep-alive comment or a split frame; the next read fixes it.
          }
          if (chunk.error) {
            throw mapHttpError(400, chunk.error.message ?? 'Provider error', provider);
          }
          const choice = chunk.choices?.[0];
          const delta = choice?.delta ?? {};
          if (typeof delta.content === 'string' && delta.content) {
            content += delta.content;
            total += delta.content.length;
            onDelta?.(delta.content, total);
          }
          const r = delta.reasoning ?? delta.reasoning_content;
          if (typeof r === 'string' && r) reasoning += r;
          const fr = choice?.finish_reason ?? choice?.native_finish_reason;
          if (fr) finishReason = fr;
        }
      }
    }
  } catch (err) {
    if (external?.aborted) {
      throw new LessonError('STALE_REQUEST', 'Request superseded by a newer question.');
    }
    if (err instanceof LessonError) throw err;
    // A stream that dies mid-flight still has usable text; only a stream that
    // produced nothing at all is a hard failure.
    if (!content.trim()) {
      throw new LessonError(
        idled ? 'TIMEOUT' : 'UNAVAILABLE',
        idled
          ? `${provider} stopped sending data for ${idleMs / 1000}s.`
          : `${provider} stream broke: ${(err as Error).message}`
      );
    }
  } finally {
    clearTimeout(idleTimer);
    external?.removeEventListener('abort', onExternalAbort);
  }

  // A stream cut short by the idle watchdog is, from here on, a truncation:
  // there is partial text and the continuation path knows what to do with it.
  if (idled && content.trim() && !finishReason) finishReason = 'length';

  return { content, reasoning, finishReason };
}

/**
 * Join a continuation onto the partial reply it resumes.
 *
 * Models often re-emit the tail of what they already sent, or open with a
 * fence. Both corrupt the JSON if pasted in raw, so the overlap is detected
 * and dropped.
 */
export function stitchContinuation(existing: string, continuation: string): string {
  let next = continuation.replace(/^\s*```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  if (!next) return '';

  const maxOverlap = Math.min(existing.length, next.length, 400);
  for (let len = maxOverlap; len >= 24; len--) {
    if (existing.endsWith(next.slice(0, len))) {
      next = next.slice(len);
      break;
    }
  }
  return next;
}

/** Z.AI and OpenRouter both speak the OpenAI chat-completions shape. */
class OpenAICompatibleProvider implements LLMProvider {
  readonly name: ProviderName;
  readonly model: string;
  protected readonly apiKey: string;
  protected readonly baseUrl: string;
  /** Last provider stop reason, surfaced in errors so a hang names its cause. */
  private lastFinishReason?: string;

  constructor(name: ProviderName, cfg: ProviderConfig) {
    this.name = name;
    this.model = cfg.model?.trim() || DEFAULT_MODELS[name];
    this.apiKey = cfg.apiKey?.trim() ?? '';
    this.baseUrl = (cfg.baseUrl?.trim() || DEFAULT_BASE_URLS[name]).replace(/\/+$/, '');
    if (!this.apiKey) {
      throw new LessonError(
        'MISSING_CREDENTIALS',
        `No ${name} API key configured. Add one in the config panel (top right) or set it in .env.`
      );
    }
  }

  protected headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (this.name === 'openrouter') {
      headers['HTTP-Referer'] = 'http://localhost:5173';
      headers['X-Title'] = 'NEMO';
    }
    return headers;
  }

  /** OpenAI-shaped multimodal content: a parts array instead of a string. */
  private userContent(opts: CompleteOptions): unknown {
    if (!opts.images?.length) return opts.user;
    return [
      { type: 'text', text: opts.user },
      ...opts.images.map((b64) => ({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${b64}` },
      })),
    ];
  }

  private requestBody(
    opts: CompleteOptions,
    messages: Array<Record<string, unknown>>,
    stream: boolean,
    includeResponseFormat: boolean
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: opts.temperature ?? 0.3,
      // Reasoning models spend tokens thinking before they emit anything, so
      // a budget sized for a chat model yields an empty completion.
      max_tokens: opts.maxTokens ?? 8000,
      stream,
    };
    if (includeResponseFormat && opts.json) {
      body.response_format = { type: 'json_object' };
    }
    if (this.name === 'openrouter' && opts.json) {
      // Planning agents choose from a fixed registry — they do not need deep
      // deliberation, and on a reasoning model the thinking eats the budget
      // the answer needs, truncating the JSON. Ignored by non-reasoning
      // models, so it is safe to send unconditionally.
      body.reasoning = { effort: 'low' };
    }
    return body;
  }

  /** One round trip. Streams when asked, and returns whatever text arrived. */
  private async request(
    opts: CompleteOptions,
    messages: Array<Record<string, unknown>>,
    stream: boolean,
    includeResponseFormat: boolean,
    runningTotal: number
  ): Promise<StreamResult> {
    const res = await fetchWithTimeout(
      `${this.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(this.requestBody(opts, messages, stream, includeResponseFormat)),
      },
      opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      this.name,
      opts.signal
    );

    if (!res.ok) throw mapHttpError(res.status, await res.text(), this.name);

    if (stream) {
      return readSseStream(
        res,
        this.name,
        STREAM_IDLE_TIMEOUT_MS,
        opts.onDelta,
        runningTotal,
        opts.signal
      );
    }

    const data = (await res.json()) as ChatResponse;
    if (data.error) throw mapHttpError(400, data.error.message ?? 'Provider error', this.name);

    // Reasoning models leave `content` empty and put the text elsewhere;
    // reading only `content` is what made those models look like a hang.
    const norm = normalizeChatResponse(data);
    if (norm.text) opts.onDelta?.(norm.text, runningTotal + norm.text.length);
    return {
      content: norm.reasoningOnly ? '' : norm.text,
      reasoning: norm.reasoningOnly ? norm.text : '',
      finishReason: norm.finishReason,
    };
  }

  async complete(opts: CompleteOptions): Promise<string> {
    // Only send response_format where the provider is known to honour it.
    // Many open models on OpenRouter reject or silently ignore it.
    const wantsJsonFlag = Boolean(opts.json) && this.name !== 'openrouter';
    const stream = opts.stream !== false;
    const maxContinuations = opts.maxContinuations ?? DEFAULT_MAX_CONTINUATIONS;

    const baseMessages: Array<Record<string, unknown>> = [
      { role: 'system', content: opts.system },
      { role: 'user', content: this.userContent(opts) },
    ];

    let result: StreamResult;
    try {
      result = await this.request(opts, baseMessages, stream, wantsJsonFlag, 0);
    } catch (err) {
      // A provider that refused the json flag is worth one plain retry.
      if (wantsJsonFlag && err instanceof LessonError && err.code === 'INVALID_RESPONSE') {
        result = await this.request(opts, baseMessages, stream, false, 0);
      } else {
        throw err;
      }
    }

    let content = result.content;
    this.lastFinishReason = result.finishReason;

    /*
     * Continuation (brief section 35).
     *
     * A reply that stopped at the token limit is not a failure: the model was
     * mid-sentence. Restarting throws away everything it had already worked
     * out and usually truncates again in the same place. Instead the partial
     * text is handed back as the assistant turn and the model is asked to
     * resume, which is how a long visual plan gets finished at all.
     */
    for (let i = 0; i < maxContinuations && result.finishReason === 'length' && content.trim(); i++) {
      opts.onNotice?.(
        `Reply hit the token limit — asking ${this.model} to continue (part ${i + 2}).`
      );
      const continuationMessages: Array<Record<string, unknown>> = [
        ...baseMessages,
        { role: 'assistant', content },
        {
          role: 'user',
          content:
            'Your previous message was cut off at the token limit. Continue it from ' +
            'exactly where it stopped. Output only the continuation: do not repeat any ' +
            'text you already sent, do not restart, and do not wrap it in a code fence.',
        },
      ];

      let next: StreamResult;
      try {
        next = await this.request(
          { ...opts, json: false },
          continuationMessages,
          stream,
          false,
          content.length
        );
      } catch (err) {
        // Continuation is best-effort: whatever is already in hand still gets
        // repaired and used rather than thrown away.
        opts.onNotice?.(`Continuation failed (${(err as Error).message}); using the partial reply.`);
        break;
      }
      result = next;
      this.lastFinishReason = next.finishReason;
      const stitched = stitchContinuation(content, next.content);
      content += stitched;
      if (!stitched.trim()) break;
    }

    // The whole budget went to reasoning: that text often still holds the JSON.
    if (!content.trim() && result.reasoning.trim()) {
      content = result.reasoning;
    }

    if (!content.trim()) {
      throw new LessonError(
        'EMPTY_RESPONSE',
        `${this.name} returned no usable content for model "${this.model}"` +
          (this.lastFinishReason ? ` (finish_reason: ${this.lastFinishReason})` : '') +
          '. Try a different model in the Config Panel — free reasoning models often return only their reasoning.'
      );
    }
    return stripThinkTags(content) || content;
  }
}

interface OpenRouterModelRecord {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  context_length?: unknown;
  created?: unknown;
  architecture?: {
    input_modalities?: unknown;
    output_modalities?: unknown;
  } | null;
  pricing?: Record<string, unknown> | null;
  supported_parameters?: unknown;
  top_provider?: { max_completion_tokens?: unknown } | null;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && Boolean(item)))];
}

function openRouterPricing(raw: Record<string, unknown> | null | undefined): ModelPricing | undefined {
  if (!raw) return undefined;
  const pricing: ModelPricing = {
    currency: 'USD',
    prompt: finiteNumber(raw.prompt),
    completion: finiteNumber(raw.completion),
    request: finiteNumber(raw.request),
    image: finiteNumber(raw.image),
    webSearch: finiteNumber(raw.web_search),
    internalReasoning: finiteNumber(raw.internal_reasoning),
    inputCacheRead: finiteNumber(raw.input_cache_read),
    inputCacheWrite: finiteNumber(raw.input_cache_write),
  };
  return Object.values(pricing).some((value) => typeof value === 'number') ? pricing : undefined;
}

function openRouterPriceTier(
  id: string,
  pricing: ModelPricing | undefined
): ModelInfo['pricingTier'] {
  if (id.endsWith(':free')) return 'free';
  if (!pricing) return 'unknown';
  const amounts = Object.values(pricing).filter((value): value is number => typeof value === 'number');
  if (amounts.length === 0) return 'unknown';
  return amounts.some((amount) => amount > 0) ? 'paid' : 'free';
}

function openRouterModel(raw: OpenRouterModelRecord): ModelInfo | null {
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null;
  const id = raw.id.trim();
  const pricing = openRouterPricing(raw.pricing);
  const pricingTier = openRouterPriceTier(id, pricing);
  const supportedParameters = stringList(raw.supported_parameters);
  return {
    id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id,
    provider: 'openrouter',
    description:
      typeof raw.description === 'string' && raw.description.trim()
        ? raw.description.trim()
        : undefined,
    contextLength: finiteNumber(raw.context_length),
    maxOutputTokens: finiteNumber(raw.top_provider?.max_completion_tokens),
    inputModalities: stringList(raw.architecture?.input_modalities),
    outputModalities: stringList(raw.architecture?.output_modalities),
    capabilities: supportedParameters,
    supportedParameters,
    pricing,
    pricingTier,
    isFree: pricingTier === 'unknown' ? null : pricingTier === 'free',
    createdAt: finiteNumber(raw.created),
  };
}

/** OpenRouter generation plus provider-owned live catalog discovery. */
export class OpenRouterProvider extends OpenAICompatibleProvider implements ModelProvider {
  constructor(cfg: ProviderConfig) {
    super('openrouter', cfg);
  }

  async listModels(opts: ListModelsOptions = {}): Promise<ModelInfo[]> {
    const url = new URL(`${this.baseUrl}/models`);
    // NEMO needs a textual lesson plan; exclude image/audio-only catalogs at the source.
    url.searchParams.set('output_modalities', 'text');
    if (opts.search?.trim()) url.searchParams.set('q', opts.search.trim());
    if (
      opts.sort === 'context-high-to-low' ||
      opts.sort === 'pricing-low-to-high' ||
      opts.sort === 'pricing-high-to-low' ||
      opts.sort === 'newest'
    ) {
      url.searchParams.set('sort', opts.sort);
    }

    const res = await fetchWithTimeout(
      url.toString(),
      { method: 'GET', headers: this.headers() },
      discoveryTimeout(opts.timeoutMs),
      'openrouter',
      opts.signal
    );
    if (!res.ok) throw mapHttpError(res.status, await res.text(), 'openrouter');
    const payload = await readProviderJson(res, 'openrouter');
    if (
      !payload ||
      typeof payload !== 'object' ||
      !Array.isArray((payload as { data?: unknown }).data)
    ) {
      throw new LessonError('INVALID_RESPONSE', 'OpenRouter returned no model catalog.');
    }
    const models = (payload as { data: OpenRouterModelRecord[] }).data
      .map(openRouterModel)
      .filter((model): model is ModelInfo => model !== null);
    return applyModelQuery(models, opts);
  }

  async healthCheck(
    opts: Pick<ListModelsOptions, 'timeoutMs' | 'signal'> = {}
  ): Promise<ProviderHealth> {
    return checkDiscoveredModels('openrouter', () => this.listModels(opts));
  }
}

/** Z.AI does not document a live model-list endpoint; never invent a catalog. */
class ZaiProvider extends OpenAICompatibleProvider implements ModelProvider {
  constructor(cfg: ProviderConfig) {
    super('zai', cfg);
  }

  async listModels(): Promise<ModelInfo[]> {
    throw new LessonError(
      'UNSUPPORTED',
      'Z.AI does not expose an official model-discovery endpoint. Enter a documented model ID manually.'
    );
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: 'zai',
      ok: false,
      status: 'unsupported',
      latencyMs: 0,
      message: 'Z.AI has no documented non-billable discovery or health endpoint.',
    };
  }
}

interface GeminiModelRecord {
  name?: unknown;
  baseModelId?: unknown;
  version?: unknown;
  displayName?: unknown;
  description?: unknown;
  inputTokenLimit?: unknown;
  outputTokenLimit?: unknown;
  supportedGenerationMethods?: unknown;
  thinking?: unknown;
}

export class GeminiProvider implements ModelProvider {
  readonly name: ProviderName = 'gemini';
  readonly model: string;
  private apiKey: string;

  constructor(cfg: ProviderConfig) {
    this.model = cfg.model?.trim() || DEFAULT_MODELS.gemini;
    this.apiKey = cfg.apiKey?.trim() ?? '';
    if (!this.apiKey) {
      throw new LessonError(
        'MISSING_CREDENTIALS',
        'No Gemini API key configured. Add one in the config panel (top right) or set it in .env.'
      );
    }
  }

  async listModels(opts: ListModelsOptions = {}): Promise<ModelInfo[]> {
    const timeoutMs = discoveryTimeout(opts.timeoutMs);
    const records: GeminiModelRecord[] = [];
    let pageToken: string | undefined;

    // Gemini permits up to 1000 models per page. The cap guards a malformed
    // pagination loop while still leaving ample room for a real catalog.
    for (let page = 0; page < 10; page++) {
      const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
      url.searchParams.set('pageSize', '1000');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const res = await fetchWithTimeout(
        url.toString(),
        { method: 'GET', headers: { 'x-goog-api-key': this.apiKey } },
        timeoutMs,
        'gemini',
        opts.signal
      );
      if (!res.ok) throw mapHttpError(res.status, await res.text(), 'gemini');
      const payload = await readProviderJson(res, 'gemini');
      if (
        !payload ||
        typeof payload !== 'object' ||
        !Array.isArray((payload as { models?: unknown }).models)
      ) {
        throw new LessonError('INVALID_RESPONSE', 'Gemini returned no model catalog.');
      }
      records.push(...((payload as { models: GeminiModelRecord[] }).models ?? []));
      const next = (payload as { nextPageToken?: unknown }).nextPageToken;
      if (typeof next !== 'string' || !next) {
        pageToken = undefined;
        break;
      }
      pageToken = next;
    }

    if (pageToken) {
      throw new LessonError(
        'INVALID_RESPONSE',
        'Gemini model discovery exceeded the pagination safety limit.'
      );
    }

    const models = records
      .map((raw): ModelInfo | null => {
        const methods = stringList(raw.supportedGenerationMethods);
        // NEMO calls generateContent, so embedding/tuning-only resources are unusable here.
        if (!methods.includes('generateContent') || typeof raw.name !== 'string') return null;
        const id = raw.name.replace(/^models\//, '').trim();
        if (!id) return null;
        const capabilities = raw.thinking === true ? [...methods, 'thinking'] : methods;
        return {
          id,
          name:
            typeof raw.displayName === 'string' && raw.displayName.trim()
              ? raw.displayName.trim()
              : id,
          provider: 'gemini',
          description:
            typeof raw.description === 'string' && raw.description.trim()
              ? raw.description.trim()
              : undefined,
          contextLength: finiteNumber(raw.inputTokenLimit),
          maxOutputTokens: finiteNumber(raw.outputTokenLimit),
          // Gemini's models.list schema does not publish modality or pricing fields.
          // Unknown is safer than inferring capabilities or billing from a model name.
          inputModalities: [],
          outputModalities: [],
          capabilities: [...new Set(capabilities)],
          supportedGenerationMethods: methods,
          pricingTier: 'unknown',
          isFree: null,
          version: typeof raw.version === 'string' ? raw.version : undefined,
          baseModelId: typeof raw.baseModelId === 'string' ? raw.baseModelId : undefined,
        };
      })
      .filter((model): model is ModelInfo => model !== null);
    return applyModelQuery(models, opts);
  }

  async healthCheck(
    opts: Pick<ListModelsOptions, 'timeoutMs' | 'signal'> = {}
  ): Promise<ProviderHealth> {
    return checkDiscoveredModels('gemini', () => this.listModels(opts));
  }

  async complete(opts: CompleteOptions): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    const body: Record<string, unknown> = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: opts.user },
            ...(opts.images ?? []).map((b64) => ({
              inlineData: { mimeType: 'image/png', data: b64 },
            })),
          ],
        },
      ],
      systemInstruction: { parts: [{ text: opts.system }] },
      generationConfig: {
        temperature: opts.temperature ?? 0.3,
        maxOutputTokens: opts.maxTokens ?? 8000,
        ...(opts.json ? { responseMimeType: 'application/json' } : {}),
      },
    };

    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify(body),
      },
      opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      'gemini',
      opts.signal
    );

    if (!res.ok) throw mapHttpError(res.status, await res.text(), 'gemini');

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const content =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!content.trim()) {
      throw new LessonError('EMPTY_RESPONSE', 'Gemini returned an empty response.');
    }
    opts.onDelta?.(content, content.length);
    return content;
  }
}

/**
 * Deterministic offline provider. `complete` is never called — the pipeline
 * short-circuits to canned plans when the provider is `mock`, so this exists
 * only to make an accidental call loud.
 */
class MockProvider implements ModelProvider {
  readonly name: ProviderName = 'mock';
  readonly model = DEFAULT_MODELS.mock;

  async listModels(opts: ListModelsOptions = {}): Promise<ModelInfo[]> {
    return applyModelQuery(
      [
        {
          id: this.model,
          name: 'Deterministic Demo',
          provider: 'mock',
          inputModalities: ['text'],
          outputModalities: ['lesson-plan'],
          capabilities: ['scripted-lessons'],
          pricingTier: 'free',
          isFree: true,
        },
      ],
      opts
    );
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: 'mock',
      ok: true,
      status: 'healthy',
      latencyMs: 0,
      modelCount: 1,
    };
  }

  async complete(): Promise<string> {
    throw new LessonError(
      'UNSUPPORTED',
      'The mock provider serves canned plans; it does not call a model.'
    );
  }
}

export function createProvider(cfg: ProviderConfig): ModelProvider {
  switch (cfg.provider) {
    case 'zai':
      return new ZaiProvider(cfg);
    case 'openrouter':
      return new OpenRouterProvider(cfg);
    case 'gemini':
      return new GeminiProvider(cfg);
    case 'mock':
      return new MockProvider();
    default:
      throw new LessonError('UNSUPPORTED', `Unknown provider "${String(cfg.provider)}".`);
  }
}

/* --------------------------------------------------------- resilience */

export interface ResilientOptions extends CompleteOptions {
  /** Attempts per model before moving on. */
  attemptsPerModel?: number;
  /** Explicit model IDs to try after the configured one. Never guessed. */
  fallbackModels?: string[];
  /** Injected in tests so fallback can be exercised without network calls. */
  factory?: (cfg: ProviderConfig) => LLMProvider;
}

export interface ResilientResult {
  text: string;
  /** The model that actually answered — not necessarily the one requested. */
  model: string;
  /** Recovery steps taken, for the trace and the status strip. */
  notices: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Complete with retry and model fallback (brief section 26).
 *
 * A lesson is lost only after every attempt on every configured model has
 * failed, and the user is told which model finally answered. Fallback is
 * explicit and reported — never a silent substitution.
 */
export async function completeResilient(
  cfg: ProviderConfig,
  opts: ResilientOptions
): Promise<ResilientResult> {
  const attempts = Math.max(1, opts.attemptsPerModel ?? 2);
  const make = opts.factory ?? createProvider;
  const notices: string[] = [];
  const note = (n: string) => {
    notices.push(n);
    opts.onNotice?.(n);
  };

  const primary = cfg.model?.trim() || DEFAULT_MODELS[cfg.provider];
  const configuredAlternates = process.env.MODEL_FALLBACK_MODELS
    ?.split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  const alternates = (opts.fallbackModels ?? configuredAlternates ?? []).filter(
    (m) => m !== primary
  );
  const chain = [primary, ...alternates];

  let lastError: LessonError | null = null;

  for (const [modelIndex, model] of chain.entries()) {
    if (modelIndex > 0) {
      note(`Falling back to ${model} after ${primary} could not finish.`);
    }

    let provider: LLMProvider;
    try {
      provider = make({ ...cfg, model });
    } catch (err) {
      // A missing key fails identically for every model in the chain.
      throw err instanceof LessonError ? err : new LessonError('UNAVAILABLE', (err as Error).message);
    }

    for (let attempt = 0; attempt < attempts; attempt++) {
      if (opts.signal?.aborted) {
        throw new LessonError('STALE_REQUEST', 'Request superseded by a newer question.');
      }
      try {
        const text = await provider.complete({ ...opts, onNotice: note });
        return { text, model, notices };
      } catch (err) {
        const le =
          err instanceof LessonError
            ? err
            : new LessonError('UNAVAILABLE', (err as Error).message);
        // A superseded request and a bad key are final: retrying is pointless.
        if (le.code === 'STALE_REQUEST' || le.code === 'MISSING_CREDENTIALS') throw le;
        lastError = le;

        if (!RETRYABLE.has(le.code) || attempt === attempts - 1) break;
        const backoff = 800 * 2 ** attempt;
        note(`${model} failed (${le.code}); retrying in ${backoff / 1000}s.`);
        await sleep(backoff);
      }
    }
  }

  throw lastError ?? new LessonError('UNAVAILABLE', 'No model produced a response.');
}

/** Merge a browser-supplied config with environment defaults. */
export function resolveProviderConfig(
  body: Partial<ProviderConfig> | undefined,
  options: { lockProvider?: boolean } = {}
): ProviderConfig {
  const env = process.env;
  const configuredDefault = (env.NEMO_PROVIDER ?? (env.OPENROUTER_API_KEY ? 'openrouter' : 'zai')) as ProviderName;
  let provider = (body?.provider ?? configuredDefault) as ProviderName;

  // If the browser sent default 'zai' without a key, but .env configured openrouter or another provider with a key,
  // prefer the configured provider so the user is not blocked.
  if (
    !options.lockProvider &&
    provider === 'zai' &&
    !body?.apiKey?.trim() &&
    !env.ZAI_API_KEY &&
    configuredDefault !== 'zai'
  ) {
    provider = configuredDefault;
  }

  const fromEnv: Record<ProviderName, { key?: string; model?: string; baseUrl?: string }> = {
    zai: { key: env.ZAI_API_KEY, model: env.ZAI_MODEL, baseUrl: env.ZAI_BASE_URL },
    openrouter: { key: env.OPENROUTER_API_KEY, model: env.OPENROUTER_MODEL },
    gemini: { key: env.GEMINI_API_KEY, model: env.GEMINI_MODEL },
    mock: {},
  };
  const e = fromEnv[provider] ?? {};
  return {
    provider,
    apiKey: body?.apiKey?.trim() || e.key,
    model: body?.model?.trim() || e.model,
    baseUrl: body?.baseUrl?.trim() || e.baseUrl,
  };
}

/** Attempt to repair and parse JSON that was truncated by token limits. */
export function tryRepairTruncatedJson(candidate: string): unknown | null {
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  const slice = candidate.slice(start);

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < slice.length; i++) {
    const c = slice[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === '\\') {
      escaped = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === c) stack.pop();
    }
  }

  let repaired = slice;
  if (inString) repaired += '"';

  // Strip trailing partial keys, colons, or commas
  repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*"[^"]*$/g, '');
  repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*$/g, '');
  repaired = repaired.replace(/,\s*"[^"]*"\s*$/g, '');
  repaired = repaired.replace(/,\s*$/g, '');

  // Close remaining unclosed brackets in reverse order
  for (let i = stack.length - 1; i >= 0; i--) {
    repaired += stack[i];
  }

  try {
    return JSON.parse(repaired);
  } catch {
    // Second attempt: strip the last incomplete object in array if present
    try {
      const lastObjStart = repaired.lastIndexOf('{');
      if (lastObjStart > 0) {
        const sub = repaired.slice(0, lastObjStart).replace(/,\s*$/, '') + ']';
        return JSON.parse(sub);
      }
    } catch {}
    return null;
  }
}

/** Pull the first JSON object or array out of a model response. */
export function extractJson(raw: string, allowRepair = false): unknown {
  const text = raw.trim();
  // Strip a fenced block if the model wrapped its JSON in one.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    // Fall through to bracket matching.
  }

  const start = candidate.search(/[[{]/);
  if (start === -1) {
    throw new LessonError('INVALID_RESPONSE', 'Model response contained no JSON.', [
      candidate.slice(0, 200),
    ]);
  }
  const open = candidate[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === '\\') {
      escaped = true;
      continue;
    }
    if (c === '"') inString = !inString;
    if (inString) continue;
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1));
        } catch (err) {
          if (allowRepair) {
            const repaired = tryRepairTruncatedJson(candidate);
            if (repaired !== null) return repaired;
          }
          throw new LessonError('INVALID_RESPONSE', 'Model returned malformed JSON.', [
            (err as Error).message,
          ]);
        }
      }
    }
  }

  // Attempt auto-repair for truncated JSON output if explicitly requested
  if (allowRepair) {
    const repaired = tryRepairTruncatedJson(candidate);
    if (repaired !== null) {
      return repaired;
    }
  }

  throw new LessonError('INVALID_RESPONSE', 'Model returned truncated JSON.', [
    candidate.slice(-200),
  ]);
}

export type { FailureCode };
