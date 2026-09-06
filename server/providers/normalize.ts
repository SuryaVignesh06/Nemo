/**
 * NEMO — provider response normalisation.
 *
 * The single reason lessons "return nothing" on some models.
 *
 * A chat completion is not simply `choices[0].message.content`. Depending on the
 * model and provider that field can be empty while the actual text sits
 * somewhere else entirely:
 *
 *   - Reasoning models (Nemotron, DeepSeek-R1, QwQ, o-series via OpenRouter)
 *     return their working in `message.reasoning` or `message.reasoning_details`
 *     and may leave `content` empty — especially when max_tokens was small
 *     enough that the reasoning consumed the entire budget.
 *   - Some open models emit `<think>...</think>` inline in `content`, with the
 *     real answer after the closing tag.
 *   - Multimodal-shaped replies return `content` as an array of parts.
 *   - A truncated reply (finish_reason "length") is a *different* failure from
 *     an empty one and must not be retried identically.
 *
 * Reading only `content` turns every one of these into "the model returned
 * nothing", which is what made the app hang: three retries of a request that was
 * actually succeeding.
 *
 * This module is deliberately provider-shaped rather than model-shaped, so a new
 * reasoning model works without a code change.
 */

export type ContentSource = 'content' | 'reasoning' | 'parts' | 'text' | 'none';

export interface NormalizedResponse {
  /** Usable text, already stripped of think-tags. Empty means no output. */
  text: string;
  /** Where the text was found, for the trace. */
  source: ContentSource;
  /** Provider's stop reason, when given. */
  finishReason?: string;
  /** True when the model was cut off mid-reply rather than finishing. */
  truncated: boolean;
  /** True when the only text available was the model's reasoning. */
  reasoningOnly: boolean;
  promptTokens?: number;
  completionTokens?: number;
}

/** Shapes seen in the wild across OpenAI-compatible providers. */
interface ChatChoice {
  message?: {
    content?: string | Array<{ type?: string; text?: string }> | null;
    reasoning?: string | null;
    reasoning_content?: string | null;
    reasoning_details?: Array<{ text?: string; summary?: string }> | null;
    text?: string | null;
  } | null;
  text?: string | null;
  finish_reason?: string | null;
  native_finish_reason?: string | null;
}

export interface ChatResponse {
  choices?: ChatChoice[] | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  error?: { message?: string; code?: number | string } | null;
}

/**
 * Remove a model's inline reasoning block.
 *
 * Several open models wrap their working in <think>…</think> and then give the
 * answer. An unclosed tag means the reply was cut off mid-thought, so
 * everything from the tag on is discarded rather than fed to a JSON parser.
 */
export function stripThinkTags(raw: string): string {
  let out = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
  out = out.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  // An opening tag with no close: the rest is unterminated reasoning.
  const dangling = out.search(/<think(?:ing)?>/i);
  if (dangling !== -1) out = out.slice(0, dangling);
  // Some providers use these as plain delimiters.
  out = out.replace(/^[\s\S]*?<\/think(?:ing)?>/i, '');
  return out.trim();
}

function fromParts(content: Array<{ type?: string; text?: string }>): string {
  return content
    .map((p) => (typeof p?.text === 'string' ? p.text : ''))
    .join('')
    .trim();
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v;
  }
  return '';
}

/**
 * Pull usable text out of a chat completion, wherever the provider put it.
 *
 * Order matters: real content wins over reasoning, because a model that
 * produced both meant the content. Reasoning is a last resort, and is flagged
 * so the caller can widen the token budget instead of blindly retrying.
 */
export function normalizeChatResponse(data: ChatResponse): NormalizedResponse {
  const choice = data.choices?.[0] ?? {};
  const message = choice.message ?? {};

  const finishReason =
    choice.finish_reason ?? choice.native_finish_reason ?? undefined;
  const truncated = finishReason === 'length';

  let text = '';
  let source: ContentSource = 'none';

  if (Array.isArray(message.content)) {
    text = fromParts(message.content);
    if (text) source = 'parts';
  } else if (typeof message.content === 'string' && message.content.trim()) {
    text = message.content;
    source = 'content';
  }

  // Some providers put the completion at the choice level, not the message.
  if (!text) {
    const alt = firstNonEmpty(message.text, choice.text);
    if (alt) {
      text = alt;
      source = 'text';
    }
  }

  // Strip inline reasoning before deciding whether anything usable is left.
  if (text) {
    const stripped = stripThinkTags(text);
    if (stripped) {
      text = stripped;
    } else {
      // The entire reply was reasoning; fall through to the reasoning fields.
      text = '';
      source = 'none';
    }
  }

  let reasoningOnly = false;
  if (!text) {
    const details = message.reasoning_details ?? [];
    const fromDetails = details
      .map((d) => firstNonEmpty(d?.text, d?.summary))
      .join('\n')
      .trim();

    const reasoning = firstNonEmpty(
      message.reasoning,
      message.reasoning_content,
      fromDetails
    );

    if (reasoning) {
      // A reasoning model that spent its whole budget thinking. The text is
      // usable — a JSON object is often in there — but the caller should know
      // it came from reasoning so it can raise max_tokens rather than retry.
      text = stripThinkTags(reasoning) || reasoning.trim();
      source = 'reasoning';
      reasoningOnly = true;
    }
  }

  return {
    text: text.trim(),
    source,
    finishReason,
    truncated,
    reasoningOnly,
    promptTokens: data.usage?.prompt_tokens,
    completionTokens: data.usage?.completion_tokens,
  };
}
