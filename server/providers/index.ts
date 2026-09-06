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
}

export interface LLMProvider {
  readonly name: ProviderName;
  readonly model: string;
  complete(opts: CompleteOptions): Promise<string>;
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

/** Map transport and HTTP status into the explicit failure taxonomy. */
function mapHttpError(status: number, body: string, provider: string): LessonError {
  const snippet = body.slice(0, 300);
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

/** Z.AI and OpenRouter both speak the OpenAI chat-completions shape. */
class OpenAICompatibleProvider implements LLMProvider {
  readonly name: ProviderName;
  readonly model: string;
  private apiKey: string;
  private baseUrl: string;
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

  async complete(opts: CompleteOptions): Promise<string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (this.name === 'openrouter') {
      headers['HTTP-Referer'] = 'http://localhost:5173';
      headers['X-Title'] = 'NEMO';
    }

    const executeRequest = async (includeResponseFormat: boolean): Promise<string> => {
      // OpenAI-shaped multimodal content: a parts array instead of a string.
      const userContent = opts.images?.length
        ? [
            { type: 'text', text: opts.user },
            ...opts.images.map((b64) => ({
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${b64}` },
            })),
          ]
        : opts.user;

      const body: Record<string, unknown> = {
        model: this.model,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: userContent },
        ],
        temperature: opts.temperature ?? 0.3,
        // Reasoning models spend tokens thinking before they emit anything, so
        // a budget sized for a chat model yields an empty completion.
        max_tokens: opts.maxTokens ?? 8000,
        stream: false,
      };
      if (includeResponseFormat && opts.json) {
        body.response_format = { type: 'json_object' };
      }

      const res = await fetchWithTimeout(
        `${this.baseUrl}/chat/completions`,
        { method: 'POST', headers, body: JSON.stringify(body) },
        opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        this.name,
        opts.signal
      );

      if (!res.ok) throw mapHttpError(res.status, await res.text(), this.name);

      const data = (await res.json()) as ChatResponse;

      if (data.error) {
        throw mapHttpError(400, data.error.message ?? 'Provider error', this.name);
      }

      // Reasoning models leave `content` empty and put the text elsewhere;
      // reading only `content` is what made those models look like a hang.
      const norm = normalizeChatResponse(data);
      this.lastFinishReason = norm.finishReason;

      if (!norm.text && norm.truncated) {
        throw new LessonError(
          'INVALID_RESPONSE',
          `${this.name} hit the token limit before producing any answer. ` +
            `The model "${this.model}" spent its whole budget reasoning — raise max tokens or pick a non-reasoning model.`
        );
      }

      if (norm.text && norm.truncated) {
        throw new LessonError(
          'INVALID_RESPONSE',
          `${this.name} cut the reply off at the token limit (model "${this.model}").`,
          [norm.text.slice(-200)]
        );
      }

      return norm.text;
    };

    // Only send response_format where the provider is known to honour it.
    // Many open models on OpenRouter reject or silently ignore it.
    const wantsJsonFlag = Boolean(opts.json) && this.name !== 'openrouter';

    let content = '';
    try {
      content = await executeRequest(wantsJsonFlag);
    } catch (err) {
      // A provider that refused the json flag is worth one plain retry.
      if (wantsJsonFlag && err instanceof LessonError && err.code === 'INVALID_RESPONSE') {
        content = await executeRequest(false);
      } else {
        throw err;
      }
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

class GeminiProvider implements LLMProvider {
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
    return content;
  }
}

/**
 * Deterministic offline provider. `complete` is never called — the pipeline
 * short-circuits to canned plans when the provider is `mock`, so this exists
 * only to make an accidental call loud.
 */
class MockProvider implements LLMProvider {
  readonly name: ProviderName = 'mock';
  readonly model = DEFAULT_MODELS.mock;
  async complete(): Promise<string> {
    throw new LessonError(
      'UNSUPPORTED',
      'The mock provider serves canned plans; it does not call a model.'
    );
  }
}

export function createProvider(cfg: ProviderConfig): LLMProvider {
  switch (cfg.provider) {
    case 'zai':
      return new OpenAICompatibleProvider('zai', cfg);
    case 'openrouter':
      return new OpenAICompatibleProvider('openrouter', cfg);
    case 'gemini':
      return new GeminiProvider(cfg);
    case 'mock':
      return new MockProvider();
    default:
      throw new LessonError('UNSUPPORTED', `Unknown provider "${String(cfg.provider)}".`);
  }
}

/** Merge a browser-supplied config with environment defaults. */
export function resolveProviderConfig(body: Partial<ProviderConfig> | undefined): ProviderConfig {
  const env = process.env;
  const provider = (body?.provider ?? env.NEMO_PROVIDER ?? 'zai') as ProviderName;
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

/** Pull the first JSON object or array out of a model response. */
export function extractJson(raw: string): unknown {
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
          throw new LessonError('INVALID_RESPONSE', 'Model returned malformed JSON.', [
            (err as Error).message,
          ]);
        }
      }
    }
  }
  throw new LessonError('INVALID_RESPONSE', 'Model returned truncated JSON.', [
    candidate.slice(-200),
  ]);
}

export type { FailureCode };
