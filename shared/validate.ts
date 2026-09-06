/**
 * NEMO — strict validation of model output.
 *
 * Everything the model produces is untrusted data. This module implements the
 * registry's section 31 "AI output constraints" and section 30 anti-overlap
 * preconditions:
 *
 *   REJECT_RAW_CODE            — no Python/Manim/JS/SVG/HTML/shell anywhere
 *   REJECT_RAW_COORDINATES     — the model never owns final x/y
 *   REJECT_UNKNOWN_CAPABILITY  — action types outside the registry fail loudly
 *   REJECT_INCOMPLETE_PLAN     — placeholder/"etc." plans are repaired or failed
 *
 * Validation never repairs by inventing content. It either passes, normalises a
 * safe default, or fails with reasons.
 */

import type { LessonPlan, TeachingBeat, VisualAction, Relation, Priority } from './contracts.ts';
import { PRIORITIES } from './registry.ts';
import { canonicalType, isExecutable, isKnownCapability, RELATION_TYPES } from './registry.ts';

export interface ValidationResult {
  ok: boolean;
  reasons: string[];
}

/** Substrings that indicate the model tried to emit executable source. */
const CODE_SIGNATURES: RegExp[] = [
  /```/,
  /\bself\s*\.\s*play\s*\(/i,
  /\bfrom\s+manim(?:lib|gl)?\s+import\b/i,
  /\bimport\s+manim\b/i,
  /\bdef\s+construct\s*\(/i,
  /\bclass\s+\w+\s*\(\s*Scene\s*\)/i,
  /<\s*(?:svg|script|iframe|img|div|circle|path|rect)\b/i,
  /\bctx\s*\.\s*(?:arc|beginPath|moveTo|lineTo|fillRect)\s*\(/i,
  /\bdocument\s*\.\s*(?:write|createElement|querySelector)\b/i,
  /\b(?:eval|Function|setTimeout)\s*\(\s*['"`]/,
  /\brequire\s*\(\s*['"]/,
  /\b(?:rm\s+-rf|curl\s+http|wget\s+http|sudo\s)/i,
  /\bjavascript\s*:/i,
  /\bon(?:error|load|click)\s*=/i,
  /\.animate\s*\.\s*shift\s*\(/i,
];

/** Parameter keys that would hand the model final coordinate authority. */
const FORBIDDEN_COORD_KEYS = new Set([
  'x', 'y', 'cx', 'cy', 'left', 'top', 'right', 'bottom',
  'position', 'coords', 'coordinates', 'translate', 'offsetx', 'offsety',
  'worldx', 'worldy', 'px', 'py',
]);

/** Placeholder phrases that mean the plan stopped halfway (section 12). */
const PLACEHOLDER_PHRASES = [
  'continue similarly',
  'and so on',
  'repeat as needed',
  'repeat similarly',
  'more steps',
  'etc.',
  'etc,',
  '...continue',
  'and so forth',
  '<placeholder>',
  'todo',
  'tbd',
];

/** Scan any JSON-ish value for executable source. */
export function containsRawCode(value: unknown, path = 'root'): string[] {
  const hits: string[] = [];
  const walk = (v: unknown, p: string) => {
    if (typeof v === 'string') {
      for (const re of CODE_SIGNATURES) {
        if (re.test(v)) {
          hits.push(`${p}: matched forbidden code pattern ${re}`);
          break;
        }
      }
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${p}[${i}]`));
    } else if (v && typeof v === 'object') {
      for (const [k, item] of Object.entries(v as Record<string, unknown>)) {
        walk(item, `${p}.${k}`);
      }
    }
  };
  walk(value, path);
  return hits;
}

export function hasPlaceholderText(s: string): boolean {
  const lower = s.toLowerCase();
  return PLACEHOLDER_PHRASES.some((p) => lower.includes(p));
}

/** Strip coordinate keys the model is not allowed to own. */
/**
 * How much text each kind of board action may carry.
 *
 * The board is a blackboard, not a page: labels, equations and step lines.
 * Models nonetheless like to paste a paragraph into a DRAW_TEXT and call it a
 * visual, which lands a wall of prose across the canvas and buries the diagram
 * under it. The prose is not lost — the same words are already in the written
 * answer and the narration — so this caps what reaches the ink.
 */
const BOARD_TEXT_LIMITS: Record<string, number> = {
  WRITE_TITLE: 60,
  WRITE_SUBTITLE: 90,
  WRITE_LABEL: 48,
  WRITE_BULLET: 110,
  WRITE_NUMBERED_STEP: 120,
  DRAW_CALLOUT: 120,
  SHOW_FINAL_ANSWER: 220,
  SUMMARIZE: 220,
};
const DEFAULT_BOARD_TEXT_LIMIT = 160;

/** Parameter keys that end up as ink the learner reads. */
const TEXT_PARAM_KEYS = ['text', 'label', 'content', 'caption', 'title', 'value'];

/** Cut at the last sentence or word boundary inside the limit. */
function shorten(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const window = text.slice(0, limit);
  const sentence = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('? '),
    window.lastIndexOf('! ')
  );
  if (sentence > limit * 0.5) return window.slice(0, sentence + 1);
  const word = window.lastIndexOf(' ');
  return (word > limit * 0.5 ? window.slice(0, word) : window).trimEnd() + '…';
}

/**
 * Trim over-long text parameters in place. Returns the keys it shortened, so
 * the trim is reported rather than done behind the caller's back.
 */
export function capBoardText(params: Record<string, unknown>, type: string): string[] {
  const limit = BOARD_TEXT_LIMITS[type] ?? DEFAULT_BOARD_TEXT_LIMIT;
  const trimmed: string[] = [];
  for (const key of TEXT_PARAM_KEYS) {
    const value = params[key];
    if (typeof value !== 'string' || value.length <= limit) continue;
    params[key] = shorten(value, limit);
    trimmed.push(key);
  }
  return trimmed;
}

export function stripRawCoordinates(
  params: Record<string, unknown>
): { params: Record<string, unknown>; removed: string[] } {
  const out: Record<string, unknown> = {};
  const removed: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (FORBIDDEN_COORD_KEYS.has(k.toLowerCase())) {
      removed.push(k);
      continue;
    }
    out[k] = v;
  }
  return { params: out, removed };
}

function normaliseRelation(r: unknown): Relation | null {
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  const type = typeof o.type === 'string' ? o.type.toUpperCase() : '';
  if (!RELATION_TYPES.includes(type)) return null;
  const target = typeof o.target === 'string' ? o.target : '';
  if (!target) return null;
  const rel: Relation = { type, target };
  if (typeof o.target2 === 'string') rel.target2 = o.target2;
  if (o.gap === 'tight' || o.gap === 'normal' || o.gap === 'loose') rel.gap = o.gap;
  if (typeof o.anchor === 'string') rel.anchor = o.anchor;
  if (o.axis === 'x' || o.axis === 'y') rel.axis = o.axis;
  return rel;
}

/**
 * Validate and normalise one action. Returns the safe action, or null with
 * reasons when it must be rejected.
 */
export function validateAction(
  raw: unknown,
  beatId: string,
  index: number
): { action: VisualAction | null; reasons: string[] } {
  const reasons: string[] = [];
  const where = `beat ${beatId} action[${index}]`;

  if (!raw || typeof raw !== 'object') {
    return { action: null, reasons: [`${where}: not an object`] };
  }
  const o = raw as Record<string, unknown>;

  const codeHits = containsRawCode(o, where);
  if (codeHits.length) {
    return { action: null, reasons: [`REJECT_RAW_CODE ${codeHits[0]}`] };
  }

  const TYPE_ALIASES: Record<string, string> = {
    WRITE_TEXT: 'DRAW_TEXT',
    SHOW_TEXT: 'DRAW_TEXT',
    DISPLAY_TEXT: 'DRAW_TEXT',
    CREATE_TEXT: 'DRAW_TEXT',
    TEXT: 'DRAW_TEXT',
    DRAW_BOX: 'DRAW_RECTANGLE',
    CREATE_BOX: 'DRAW_RECTANGLE',
    BOX: 'DRAW_RECTANGLE',
    CREATE_RECTANGLE: 'DRAW_RECTANGLE',
    CREATE_CIRCLE: 'DRAW_CIRCLE',
    CIRCLE: 'DRAW_CIRCLE',
    CREATE_ARROW: 'DRAW_ARROW',
    ARROW: 'DRAW_ARROW',
    WRITE_STEP: 'WRITE_NUMBERED_STEP',
    STEP: 'WRITE_NUMBERED_STEP',
    ADD_STEP: 'WRITE_NUMBERED_STEP',
    SHOW_ANSWER: 'SHOW_FINAL_ANSWER',
    ANSWER: 'SHOW_FINAL_ANSWER',
    TITLE: 'WRITE_TITLE',
    SUBTITLE: 'WRITE_SUBTITLE',
    FORMULA: 'WRITE_FORMULA',
    EQUATION: 'WRITE_EQUATION',
    GRAPH: 'DRAW_AXES',
    AXES: 'DRAW_AXES',
  };

  let declaredType = typeof o.type === 'string' ? o.type.trim().toUpperCase() : '';
  if (declaredType && TYPE_ALIASES[declaredType]) {
    declaredType = TYPE_ALIASES[declaredType];
  }

  if (!declaredType) {
    return { action: null, reasons: [`${where}: missing action type`] };
  }
  if (!isKnownCapability(declaredType)) {
    return {
      action: null,
      reasons: [`REJECT_UNKNOWN_CAPABILITY ${where}: "${declaredType}" is not in the registry`],
    };
  }
  if (!isExecutable(declaredType)) {
    return {
      action: null,
      reasons: [
        `${where}: "${declaredType}" is a catalogued capability with no executor in this build`,
      ],
    };
  }

  const rawParams =
    o.parameters && typeof o.parameters === 'object' && !Array.isArray(o.parameters)
      ? (o.parameters as Record<string, unknown>)
      : {};
  const { params, removed } = stripRawCoordinates(rawParams);
  if (removed.length) {
    reasons.push(
      `REJECT_RAW_COORDINATES ${where}: dropped model-supplied ${removed.join(', ')}; layout owns placement`
    );
  }

  const trimmedText = capBoardText(params, canonicalType(declaredType));
  if (trimmedText.length) {
    reasons.push(
      `TRIMMED_BOARD_TEXT ${where}: shortened ${trimmedText.join(', ')}; ` +
        'prose belongs in the written answer, not on the board'
    );
  }

  const relations: Relation[] = [];
  const rawRelations = Array.isArray(o.relations)
    ? o.relations
    : o.relation
      ? [o.relation]
      : [];
  for (const r of rawRelations) {
    // A bare string relation ("BELOW") is meaningless without a target.
    const norm = normaliseRelation(r);
    if (norm) relations.push(norm);
  }

  const priority: Priority = PRIORITIES.includes(String(o.priority))
    ? (o.priority as Priority)
    : 'SECONDARY';

  const timingRaw =
    o.timing && typeof o.timing === 'object' ? (o.timing as Record<string, unknown>) : {};
  const duration = Number(timingRaw.duration);
  const delay = Number(timingRaw.delay);
  const pace =
    timingRaw.pace === 'fast' || timingRaw.pace === 'deliberate' ? timingRaw.pace : 'normal';

  const action: VisualAction = {
    actionId: typeof o.actionId === 'string' && o.actionId ? o.actionId : `${beatId}-a${index}`,
    beatId,
    type: canonicalType(declaredType),
    semanticRole:
      typeof o.semanticRole === 'string' && o.semanticRole
        ? o.semanticRole
        : declaredType.toLowerCase(),
    priority,
    parameters: params,
    relations,
    timing: {
      duration: Number.isFinite(duration) && duration > 0 ? Math.min(duration, 6) : undefined,
      delay: Number.isFinite(delay) && delay > 0 ? Math.min(delay, 3) : undefined,
      pace,
    },
  };
  if (typeof o.target === 'string' && o.target) action.target = o.target;
  if (typeof o.narrationCue === 'string') action.narrationCue = o.narrationCue;
  if (Array.isArray(o.completionCriteria)) {
    action.completionCriteria = o.completionCriteria.filter(
      (c): c is string => typeof c === 'string'
    );
  }

  return { action, reasons };
}

/**
 * Validate a whole plan. Actions that fail are reported, never silently dropped:
 * a beat that loses every action makes the plan incomplete.
 */
export function validatePlan(plan: LessonPlan): ValidationResult {
  const reasons: string[] = [];

  if (!plan.beats || plan.beats.length === 0) {
    return { ok: false, reasons: ['REJECT_INCOMPLETE_PLAN: plan has no teaching beats'] };
  }
  if (plan.beats.length < 3) {
    reasons.push(
      `REJECT_INCOMPLETE_PLAN: only ${plan.beats.length} beat(s); a complete lesson needs at least 3`
    );
  }
  if (!plan.answer || !plan.answer.trim()) {
    reasons.push('REJECT_INCOMPLETE_PLAN: plan has no answer');
  }
  if (!plan.finalSummary || !plan.finalSummary.trim()) {
    reasons.push('REJECT_INCOMPLETE_PLAN: plan has no final summary');
  }

  const codeHits = containsRawCode({
    answer: plan.answer,
    objective: plan.objective,
    finalSummary: plan.finalSummary,
    beats: plan.beats,
  });
  if (codeHits.length) {
    reasons.push(`REJECT_RAW_CODE: ${codeHits[0]}`);
  }

  const seenActionIds = new Set<string>();
  for (const beat of plan.beats) {
    const where = `beat ${beat.beatId}`;
    if (!beat.visualActions || beat.visualActions.length === 0) {
      reasons.push(`REJECT_INCOMPLETE_PLAN: ${where} has no visual actions`);
    }
    if (hasPlaceholderText(beat.explanation ?? '') || hasPlaceholderText(beat.narration ?? '')) {
      reasons.push(`REJECT_INCOMPLETE_PLAN: ${where} contains a placeholder phrase`);
    }
    if (!beat.narration || !beat.narration.trim()) {
      reasons.push(`${where}: missing narration`);
    }
    for (const a of beat.visualActions ?? []) {
      if (seenActionIds.has(a.actionId)) {
        reasons.push(`${where}: duplicate actionId "${a.actionId}"`);
      }
      seenActionIds.add(a.actionId);
      if (!isExecutable(a.type)) {
        reasons.push(`REJECT_UNKNOWN_CAPABILITY: ${where} action "${a.type}" has no executor`);
      }
    }
  }

  // A complete lesson has to actually finish: the last beat must conclude.
  const last = plan.beats[plan.beats.length - 1];
  const concludes =
    /summar|conclu|recap|final|answer|takeaway/i.test(last.objective ?? '') ||
    (last.visualActions ?? []).some(
      (a) => a.type === 'SUMMARIZE' || a.type === 'SHOW_FINAL_ANSWER' || a.type === 'SECTION_END'
    );
  if (!concludes) {
    reasons.push(
      'REJECT_INCOMPLETE_PLAN: the final beat does not conclude the lesson (no summary or final answer)'
    );
  }

  const fatal = reasons.filter((r) => r.startsWith('REJECT_'));
  return { ok: fatal.length === 0, reasons };
}

/** Normalise a raw model beat into a validated beat. */
export function normaliseBeat(
  raw: unknown,
  order: number
): { beat: TeachingBeat | null; reasons: string[] } {
  const reasons: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { beat: null, reasons: [`beat[${order}]: not an object`] };
  }
  const o = raw as Record<string, unknown>;
  const beatId =
    typeof o.beatId === 'string' && o.beatId ? o.beatId : `beat-${order + 1}`;

  const actions: VisualAction[] = [];
  const rawActions = Array.isArray(o.visualActions) ? o.visualActions : [];
  rawActions.forEach((ra, i) => {
    const { action, reasons: r } = validateAction(ra, beatId, i);
    reasons.push(...r);
    if (action) actions.push(action);
  });

  const beat: TeachingBeat = {
    beatId,
    order: typeof o.order === 'number' ? o.order : order + 1,
    objective: typeof o.objective === 'string' ? o.objective : '',
    explanation: typeof o.explanation === 'string' ? o.explanation : '',
    narration: typeof o.narration === 'string' ? o.narration : '',
    visualActions: actions,
    completionCriteria: Array.isArray(o.completionCriteria)
      ? o.completionCriteria.filter((c): c is string => typeof c === 'string')
      : [],
  };
  return { beat, reasons };
}
