/**
 * NEMO — single-pass lesson pipeline.
 *
 * Produces BOTH:
 *   1. Complete educational answer, definitions, and notes ("matter").
 *   2. Deterministic visual execution plan for the canvas.
 *
 * One streamed model call, so the first characters arrive in a few seconds and
 * the status strip reports real progress rather than a spinner. A reply that
 * runs past the token limit is continued, not discarded (brief section 35),
 * and a plan that arrives partly damaged is repaired rather than thrown away:
 * an answer the learner can read beats a clean error.
 */

import {
  type Domain,
  type LessonPlan,
  type TeachingBeat,
  type VisualAction,
  LessonError,
} from '../../shared/contracts.ts';
import { looksLikeEquation, solveEquation } from '../../shared/solver.ts';
import { normaliseBeat, validateAction, validatePlan } from '../../shared/validate.ts';
import { capabilitySheetForDomain, RELATION_TYPES } from '../../shared/registry.ts';
import { completeResilient, extractJson, type ProviderConfig } from '../providers/index.ts';

export interface DefinitionItem {
  term: string;
  definition: string;
}

export interface FastBuildResult {
  plan: LessonPlan;
  answer: string;
  definitions: DefinitionItem[];
  finalAnswer: string;
  warnings: string[];
  providerName: string;
  model: string;
}

export interface FastPipelineHooks {
  status(stage: string, detail?: string): void;
  onAnswer?(answer: { explanation: string; definitions: DefinitionItem[]; finalAnswer: string }): void;
  signal?: AbortSignal;
}

function fastSystemPrompt(domain = 'general'): string {
  return `You are NEMO, an expert visual teacher who reasons deeply and draws on an infinite blackboard.

YOUR GOAL:
Given a question, produce TWO synchronized outputs in ONE response:
1. THE COMPLETE EDUCATIONAL ANSWER ("matter"): Detailed explanation, key definitions, and final conclusion.
2. THE DETERMINISTIC VISUAL PLAN: Ordered teaching beats with allowlisted visual actions for the canvas.

CORE TEACHING RULES:
- DEFINITIONS & DETAILED NOTES BELONG IN THE "matter" SECTION: Put all concept definitions, formulas, and deep theoretical explanations in the "definitions" array and "explanation" field.
- KEEP THE BOARD CANVAS VISUAL: The blackboard canvas is an infinite visual space for diagrams, graphs, geometric shapes, equations, arrows, data structures, state transitions, and step numbers. Do NOT output large text paragraphs or textbook definitions as canvas actions — the UI displays definitions and written matter in the dedicated Matter Section!
- Visuals must be instructional and synchronized with narration.
- Do NOT output raw code or exact screen coordinates. Use SEMANTIC RELATIONS to position items.
- Allowed relations: ${RELATION_TYPES.join(', ')}.
- Allowed gaps: tight, normal, loose.
- Give each visual object a stable target id (e.g. "array_1", "eq_1", "ptr_low", "vector_v") and reuse it to transform/highlight it.
- Keep the explanation complete from start to finish. Never stop halfway.
- Output 3 to 6 focused beats. Each beat should have 2 to 4 visual actions.

ALLOWED VISUAL CAPABILITIES (choose ONLY from this list):
${capabilitySheetForDomain(domain)}

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this structure (no markdown fences, no text before or after):
{
  "domain": "${domain}",
  "objective": "Brief learning objective",
  "explanation": "Clear, comprehensive educational explanation of the topic.",
  "definitions": [
    { "term": "Key Concept 1", "definition": "Accurate definition or formula." }
  ],
  "finalAnswer": "Summary conclusion / final result",
  "beats": [
    {
      "beatId": "beat-1",
      "order": 1,
      "objective": "What this beat teaches",
      "explanation": "Core teaching point",
      "narration": "Natural speech narration for this step (what the teacher speaks).",
      "visualActions": [
        {
          "actionId": "a1",
          "beatId": "beat-1",
          "type": "DRAW_TEXT",
          "semanticRole": "PRIMARY",
          "target": "title_1",
          "relations": [],
          "priority": "PRIMARY",
          "parameters": { "text": "Topic Title" }
        }
      ]
    }
  ]
}`;
}

/**
 * Last-resort beats built from the written answer.
 *
 * Used only when the model produced prose but no visual plan. It keeps the
 * board honest — a title, the key terms, the conclusion — rather than leaving
 * the learner staring at an empty canvas beside a finished explanation.
 */
function beatsFromAnswer(
  question: string,
  definitions: DefinitionItem[],
  conclusion: string
): TeachingBeat[] {
  const beats: TeachingBeat[] = [
    {
      beatId: 'beat-1',
      order: 1,
      objective: 'Introduce the question',
      explanation: question,
      narration: question,
      completionCriteria: ['beat_visuals_complete'],
      visualActions: [
        {
          actionId: 'action-1-1',
          beatId: 'beat-1',
          type: 'WRITE_TITLE',
          semanticRole: 'PRIMARY',
          target: 'title_node',
          priority: 'PRIMARY',
          parameters: { text: question.slice(0, 80) },
          relations: [],
        },
      ],
    },
  ];

  definitions.slice(0, 4).forEach((d, i) => {
    const beatId = `beat-${i + 2}`;
    beats.push({
      beatId,
      order: i + 2,
      objective: d.term,
      explanation: d.definition,
      narration: `${d.term}. ${d.definition}`,
      completionCriteria: ['beat_visuals_complete'],
      visualActions: [
        {
          actionId: `action-${i + 2}-1`,
          beatId,
          type: 'WRITE_NUMBERED_STEP',
          semanticRole: 'PRIMARY',
          target: `term_${i + 1}`,
          priority: 'PRIMARY',
          parameters: { text: d.term, step: i + 1 },
          relations: [{ type: 'BELOW', target: i === 0 ? 'title_node' : `term_${i}`, gap: 'normal' }],
        },
      ],
    });
  });

  const last = beats.length + 1;
  beats.push({
    beatId: `beat-${last}`,
    order: last,
    objective: 'Conclusion',
    explanation: conclusion,
    narration: conclusion,
    completionCriteria: ['beat_visuals_complete'],
    visualActions: [
      {
        actionId: `action-${last}-1`,
        beatId: `beat-${last}`,
        type: 'SHOW_FINAL_ANSWER',
        semanticRole: 'PRIMARY',
        target: 'final_summary_node',
        priority: 'PRIMARY',
        parameters: { text: conclusion.slice(0, 220) },
        relations: [],
      },
    ],
  });

  return beats;
}

const DOMAINS: readonly Domain[] = [
  'mathematics',
  'computer_science',
  'physics',
  'chemistry',
  'biology',
  'electrical_engineering',
  'semiconductor',
  'embedded_systems',
  'general',
];

/**
 * Coerce whatever the model called the subject into the contract's vocabulary.
 *
 * Models answer with "computer-science", "Computer Science", "maths" and so
 * on. Passed straight through, the plan carries a domain that matches nothing,
 * and anything keyed off it silently falls back to the generic path.
 */
function normaliseDomain(raw: unknown): Domain {
  if (typeof raw !== 'string') return 'general';
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if ((DOMAINS as readonly string[]).includes(key)) return key as Domain;
  if (/^(math|maths|calculus|algebra|geometry)/.test(key)) return 'mathematics';
  if (/(computer|algorithm|programming|software|data_structure)/.test(key)) return 'computer_science';
  if (/(physic|mechanic|astronom)/.test(key)) return 'physics';
  if (/chem/.test(key)) return 'chemistry';
  if (/(bio|genetic|cell)/.test(key)) return 'biology';
  if (/(esp32|arduino|raspberry|microcontroller|embedded|gpio)/.test(key)) return 'embedded_systems';
  if (/(semiconductor|pn_junction|mosfet|diode|transistor|band_gap)/.test(key)) return 'semiconductor';
  if (/(electrical|electronics|circuit|voltage|current|resistor|capacitor)/.test(key)) return 'electrical_engineering';
  return 'general';
}

/**
 * Ask for the rest of a teaching sequence that stopped short.
 *
 * The beats already in hand are described back to the model so it continues
 * rather than restarting, and only genuinely new beats are appended — a model
 * that simply repeats itself adds nothing.
 */
async function extendPlan(
  cfg: ProviderConfig,
  args: {
    question: string;
    answer: string;
    existing: TeachingBeat[];
    domain: Domain;
    signal?: AbortSignal;
    onNotice(note: string): void;
  }
): Promise<{ beats: TeachingBeat[]; warnings: string[] }> {
  const covered = args.existing
    .map((b) => `- ${b.beatId}: ${b.objective || b.explanation}`)
    .join('\n');
  const usedIds = new Set(args.existing.map((b) => b.beatId));

  const { text } = await completeResilient(cfg, {
    system: fastSystemPrompt(args.domain),
    user:
      `Question: "${args.question}"\n\n` +
      `Complete answer already written:\n${args.answer}\n\n` +
      `The blackboard sequence so far covers:\n${covered || '- nothing yet'}\n\n` +
      'That sequence stops before the explanation is finished. Continue it with 3 to 5 ' +
      'MORE beats that carry the lesson through to its conclusion, ending with the final ' +
      'answer. Do not repeat any beat listed above. Return ONLY a JSON object of the form ' +
      '{"beats":[...]} using the same beat and visualAction schema.',
    json: true,
    maxTokens: 5000,
    maxContinuations: 3,
    temperature: 0.2,
    signal: args.signal,
    onNotice: args.onNotice,
  });

  const parsed = extractJson(text, true) as Record<string, unknown>;
  const rawBeats = Array.isArray(parsed?.beats) ? parsed.beats : [];
  const beats: TeachingBeat[] = [];
  const warnings: string[] = [];

  for (const [i, rb] of rawBeats.entries()) {
    const r = (rb && typeof rb === 'object' ? rb : {}) as Record<string, unknown>;
    let beatId = typeof r.beatId === 'string' && r.beatId ? r.beatId : '';
    if (!beatId || usedIds.has(beatId)) beatId = `beat-ext-${i + 1}`;
    usedIds.add(beatId);

    const validActions: VisualAction[] = [];
    for (const [ai, ra] of (Array.isArray(r.visualActions) ? r.visualActions : []).entries()) {
      const { action, reasons } = validateAction(ra, beatId, ai);
      warnings.push(...reasons);
      if (action) validActions.push(action);
    }

    const { beat, reasons } = normaliseBeat(
      {
        beatId,
        order: args.existing.length + i + 1,
        objective: typeof r.objective === 'string' ? r.objective : '',
        explanation: typeof r.explanation === 'string' ? r.explanation : '',
        narration: typeof r.narration === 'string' ? r.narration : '',
        completionCriteria: ['beat_visuals_complete'],
        visualActions: validActions,
      },
      args.existing.length + i
    );
    warnings.push(...reasons);
    if (beat && beat.visualActions.length > 0) beats.push(beat);
  }

  return { beats, warnings };
}

export async function buildFastLesson(
  cfg: ProviderConfig,
  question: string,
  ids: { lessonId: string; requestId: string },
  hooks: FastPipelineHooks
): Promise<FastBuildResult> {
  const trimmed = question.trim();
  if (!trimmed) throw new LessonError('UNSUPPORTED', 'Ask a question first.');
  // Give the model the relevant, compact capability sheet on its first pass.
  // This is deterministic intent routing only; the provider still supplies the
  // authoritative domain in its response and that value is normalised below.
  const inferredDomain = normaliseDomain(trimmed);

  // If question is a mathematical equation, deterministic solver solves it
  const isEq = looksLikeEquation(trimmed);
  let solvedAnswer = '';
  if (isEq) {
    try {
      const sol = solveEquation(trimmed);
      solvedAnswer = sol.finalAnswer;
    } catch {
      // Fall through to model
    }
  }

  hooks.status('DESIGNING_VISUALS', 'Creating answer & visual plan');

  const userPrompt = isEq && solvedAnswer
    ? `Question: "${trimmed}"\nVerified Equation Solution: ${solvedAnswer}\nCreate the complete explanation, definitions, and visual drawing steps.`
    : `Question: "${trimmed}"\nExplain this completely and create the blackboard visual sequence.`;

  /*
   * Streamed, with retry, continuation and model fallback underneath.
   *
   * The status ticks are the point as much as the reliability is: a long
   * generation that reports "writing the lesson — 4,200 characters" is a
   * system visibly working, where the same wait behind a silent spinner reads
   * as a hang and gets cancelled.
   */
  const recoveryNotes: string[] = [];
  let lastReport = 0;
  const { text: raw, model: answeringModel } = await completeResilient(cfg, {
    system: fastSystemPrompt(inferredDomain),
    user: userPrompt,
    json: true,
    /*
     * Deliberately modest, and the single biggest latency fix in the pipeline.
     *
     * A reasoning model sizes its thinking to the budget it is given: at
     * 16,000 tokens this same request spent 147 seconds reasoning before
     * emitting a character, then truncated anyway. At 6,000 the first
     * characters arrive in about six seconds — and a plan that genuinely needs
     * more room is continued rather than cut off, so nothing is lost.
     */
    maxTokens: 6000,
    maxContinuations: 4,
    temperature: 0.2,
    signal: hooks.signal,
    onDelta: (_chunk, total) => {
      // Throttled: one status per 400 characters, not per token.
      if (total - lastReport < 400) return;
      lastReport = total;
      hooks.status('DESIGNING_VISUALS', `Writing the lesson — ${total.toLocaleString()} characters`);
    },
    onNotice: (note) => {
      recoveryNotes.push(note);
      hooks.status('DESIGNING_VISUALS', note);
    },
  });

  hooks.status('VALIDATING', 'Checking visual execution plan');

  /*
   * Repair is enabled, and a parse failure is not the end.
   *
   * A plan that arrives with its last beat half-written is still four good
   * beats and a complete written answer. Discarding all of it because the JSON
   * did not close is the behaviour that produced "the model failed" on work
   * that had very nearly succeeded.
   */
  let parsed: Record<string, unknown>;
  try {
    parsed = extractJson(raw, true) as Record<string, unknown>;
  } catch (err) {
    throw new LessonError(
      'INVALID_RESPONSE',
      `${answeringModel} did not return a usable lesson: ${(err as Error).message}`,
      [raw.slice(0, 200)]
    );
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new LessonError('INVALID_RESPONSE', 'Model returned invalid response structure.');
  }

  const explanation = typeof parsed.explanation === 'string' ? parsed.explanation : '';
  const finalAnswer =
    typeof parsed.finalAnswer === 'string' && parsed.finalAnswer
      ? parsed.finalAnswer
      : solvedAnswer || explanation.slice(-200);

  const rawDefs = Array.isArray(parsed.definitions) ? parsed.definitions : [];
  const definitions: DefinitionItem[] = rawDefs
    .filter((d): d is Record<string, unknown> => Boolean(d && typeof d === 'object'))
    .map((d) => ({
      term: String(d.term ?? ''),
      definition: String(d.definition ?? ''),
    }))
    .filter((d) => d.term && d.definition);

  // Notify matter section immediately
  if (hooks.onAnswer) {
    hooks.onAnswer({ explanation, definitions, finalAnswer });
  }

  const rawBeats = Array.isArray(parsed.beats) ? parsed.beats : [];
  if (rawBeats.length === 0 && !explanation.trim() && !finalAnswer.trim()) {
    throw new LessonError('INCOMPLETE_PLAN', 'Model returned neither an answer nor teaching beats.');
  }

  const validBeats: TeachingBeat[] = [];
  const allWarnings: string[] = [];
  if (rawBeats.length === 0) {
    // The written answer survived but the visual plan did not. Board the
    // definitions rather than failing: a readable lesson with a thin board
    // beats an error page over work the model actually did.
    allWarnings.push('Model returned no teaching beats; boarding the written answer instead.');
    validBeats.push(...beatsFromAnswer(trimmed, definitions, finalAnswer || explanation));
  }

  for (const [i, rb] of rawBeats.entries()) {
    const r = (rb && typeof rb === 'object' ? rb : {}) as Record<string, unknown>;
    const beatId = typeof r.beatId === 'string' && r.beatId ? r.beatId : `beat-${i + 1}`;
    const rawActions = Array.isArray(r.visualActions) ? r.visualActions : [];
    const validActions: VisualAction[] = [];

    rawActions.forEach((ra, ai) => {
      const { action, reasons } = validateAction(ra, beatId, ai);
      allWarnings.push(...reasons);
      if (action) validActions.push(action);
    });

    const { beat, reasons } = normaliseBeat(
      {
        beatId,
        order: typeof r.order === 'number' ? r.order : i + 1,
        objective: typeof r.objective === 'string' ? r.objective : '',
        explanation: typeof r.explanation === 'string' ? r.explanation : '',
        narration: typeof r.narration === 'string' ? r.narration : '',
        completionCriteria: ['beat_visuals_complete'],
        visualActions: validActions,
      },
      i
    );
    allWarnings.push(...reasons);
    if (beat) validBeats.push(beat);
  }

  const domain = normaliseDomain(parsed.domain);

  /*
   * Completeness gate (brief sections 9 and 33).
   *
   * "The model answered" is not the same as "the explanation is finished". A
   * two-beat plan for binary search stops before the search has halved even
   * once, and rendering it would teach nobody anything. When the surviving
   * plan is that thin the pipeline asks for the rest of the sequence instead
   * of accepting it — the plan is extended, never restarted, so the beats the
   * model already got right are kept.
   */
  const MIN_BEATS = 3;
  const MIN_ACTIONS = 8;
  const actionCount = (beats: TeachingBeat[]) =>
    beats.reduce((n, b) => n + b.visualActions.length, 0);

  if (rawBeats.length > 0 && (validBeats.length < MIN_BEATS || actionCount(validBeats) < MIN_ACTIONS)) {
    hooks.status(
      'DESIGNING_VISUALS',
      `Plan stopped after ${validBeats.length} beat(s) — asking for the rest of the sequence`
    );
    try {
      const extra = await extendPlan(cfg, {
        question: trimmed,
        answer: explanation || finalAnswer,
        existing: validBeats,
        domain,
        signal: hooks.signal,
        onNotice: (n) => {
          recoveryNotes.push(n);
          hooks.status('DESIGNING_VISUALS', n);
        },
      });
      allWarnings.push(...extra.warnings);
      validBeats.push(...extra.beats);
    } catch (err) {
      // A thin lesson still beats no lesson; say so rather than failing.
      allWarnings.push(`Could not extend the short plan: ${(err as Error).message}`);
    }
  }

  const lessonPlan: LessonPlan = {
    lessonId: ids.lessonId,
    requestId: ids.requestId,
    question: trimmed,
    domain,
    answer: explanation || finalAnswer,
    objective: typeof parsed.objective === 'string' ? parsed.objective : trimmed,
    beats: validBeats,
    finalSummary: finalAnswer,
    status: 'READY',
  };

  const validation = validatePlan(lessonPlan);
  if (!validation.ok) {
    // If validation fails (e.g. missing conclusion beat), append summary beat
    if (!validBeats.some((b) => b.visualActions.some((a) => a.type === 'SHOW_FINAL_ANSWER' || a.type === 'SUMMARIZE'))) {
      const conclusionBeat: TeachingBeat = {
        beatId: `beat-${validBeats.length + 1}`,
        order: validBeats.length + 1,
        objective: 'Conclusion',
        explanation: finalAnswer,
        narration: `In conclusion, ${finalAnswer}`,
        completionCriteria: ['beat_visuals_complete'],
        visualActions: [
          {
            actionId: `action-${validBeats.length + 1}-1`,
            beatId: `beat-${validBeats.length + 1}`,
            type: 'SHOW_FINAL_ANSWER',
            semanticRole: 'PRIMARY',
            target: 'final_summary_node',
            priority: 'PRIMARY',
            parameters: { text: finalAnswer },
            relations: [],
          },
        ],
      };
      validBeats.push(conclusionBeat);
      lessonPlan.beats = validBeats;
    }
  }

  return {
    plan: lessonPlan,
    answer: explanation,
    definitions,
    finalAnswer,
    warnings: [...recoveryNotes, ...allWarnings],
    providerName: cfg.provider,
    // The model that actually answered, which after a fallback is not the one
    // that was configured. Reported so the user is never misled about it.
    model: answeringModel,
  };
}
