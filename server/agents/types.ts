/**
 * NEMO — shared agent plumbing.
 *
 * Agents are plain async functions over typed artifacts. They know about the
 * ModelExecutionService and the contracts, and nothing about LangGraph — the
 * graph imports agents, never the reverse. Swapping the orchestrator therefore
 * touches graph.ts alone.
 */

import type { ModelExecutionService } from '../models/execution.ts';

export interface AgentDeps {
  models: ModelExecutionService;
  signal?: AbortSignal;
  /** Reports coarse progress to the SSE stream. Never chain-of-thought. */
  status(stage: string, detail?: string): void;
}

/** Shared tail appended to every agent system prompt. */
export const COMMON_RULES = [
  'Rules that apply to every reply:',
  '- Reply with a single JSON object and nothing else. No prose, no code fences.',
  // Smaller open models tend to "show their working" — checklists, tallies,
  // per-item ticks — before the JSON. On a capped budget that working is what
  // gets sent and the JSON is what gets truncated away.
  '- Do NOT write notes, working, tallies, checklists or commentary before or',
  '  after the JSON. The first character of your reply must be "{".',
  '- Be concise. Keep every string field under 200 characters.',
  '- Never write Python, JavaScript, Manim code, or any executable source.',
  '- Never choose pixel coordinates. Position is expressed only as semantic relations.',
  '- Never invent a capability name. Use only names given to you.',
  '- Do not include private reasoning. Return decisions and results only.',
].join('\n');

export function jsonBlock(label: string, value: unknown): string {
  return `${label}:\n${JSON.stringify(value, null, 1)}`;
}
