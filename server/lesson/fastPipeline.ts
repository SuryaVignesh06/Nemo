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
  type ComprehensionCheck,
  type Domain,
  type LessonPlan,
  type TeachingBeat,
  type VisualAction,
  type SourceRef,
  type VideoRef,
  LessonError,
} from '../../shared/contracts.ts';
import { looksLikeEquation, solveEquation } from '../../shared/solver.ts';
import { normaliseBeat, validateAction, validatePlan } from '../../shared/validate.ts';
import { capabilitySheetForDomain, RELATION_TYPES } from '../../shared/registry.ts';
import { completeResilient, extractJson, type ProviderConfig } from '../providers/index.ts';
import { crawl, searchYouTube } from '../research/web.ts';

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
  onResearch?(research: { sources: SourceRef[]; videos: VideoRef[] }): void;
  signal?: AbortSignal;
  tutorDirectives?: string;
  /** Prior-turn context — a circled region, a clicked node, the last answer. */
  contextNote?: string;
}

export function isWorkflowOrStructure(query: string): boolean {
  const q = query.toLowerCase();
  return (
    /flow\s*ch[ao]t|flowchart|flow\s*chart|workflow|pipeline|architecture|diagram|graph\s*flow|sequence\s*diagram|block\s*diagram|state\s*machine/i.test(q) ||
    /how\s+(?:a\s+|the\s+)?[\w\s-]+\s+works?|how\s+does\s+[\w\s-]+\s+work|working\s+of|phases\s+of|stages\s+of|steps\s+in|cycle\s+of/i.test(q) ||
    /\b(processor|cpu|gpu|alu|compiler|interpreter|operating\s*system|kernel|http|tcp|dns|oauth|jwt|authentication|acid|ci\/cd|microservice|photosynthesis|krebs\s*cycle)\b/i.test(q)
  );
}

function synthesizeWorkflowFlowchart(
  question: string,
  definitions: DefinitionItem[],
  _webExcerpts: string
): VisualAction {
  let nodes: Array<{ id: string; label: string }> = [];
  let edges: Array<{ from: string; to: string; label?: string }> = [];

  const q = question.toLowerCase();
  if (/processor|cpu/i.test(q)) {
    nodes = [
      { id: 'fetch', label: '1. Instruction Fetch (PC / Cache)' },
      { id: 'decode', label: '2. Instruction Decode (Control Unit)' },
      { id: 'execute', label: '3. Execute (ALU)' },
      { id: 'memory', label: '4. Memory Access (RAM / Cache)' },
      { id: 'writeback', label: '5. Write Back (Registers)' },
    ];
    edges = [
      { from: 'fetch', to: 'decode', label: 'opcode' },
      { from: 'decode', to: 'execute', label: 'signals' },
      { from: 'execute', to: 'memory', label: 'addr/data' },
      { from: 'memory', to: 'writeback', label: 'result' },
    ];
  } else if (definitions.length >= 3) {
    nodes = definitions.slice(0, 5).map((d, i) => ({
      id: `stage_${i + 1}`,
      label: `${i + 1}. ${d.term}`,
    }));
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({ from: nodes[i].id, to: nodes[i + 1].id, label: 'next' });
    }
  } else {
    nodes = [
      { id: 'input', label: '1. Input / Request' },
      { id: 'process', label: '2. Processing / Transformation' },
      { id: 'validate', label: '3. Verification / Execution' },
      { id: 'output', label: '4. Output / Final State' },
    ];
    edges = [
      { from: 'input', to: 'process' },
      { from: 'process', to: 'validate' },
      { from: 'validate', to: 'output' },
    ];
  }

  return {
    actionId: `action-flowchart-${Date.now().toString(36)}`,
    beatId: 'beat-flowchart',
    type: 'CREATE_FLOWCHART',
    semanticRole: 'PRIMARY',
    target: 'workflow_flowchart',
    priority: 'PRIMARY',
    parameters: {
      direction: 'LR',
      title: question.slice(0, 50),
      nodes,
      edges,
    },
    relations: [],
  };
}

function fastSystemPrompt(domain = 'general', tutorDirectives = ''): string {
  return `You are NEMO, an expert visual teacher who reasons deeply and draws on an infinite blackboard.
${tutorDirectives ? `\nADAPTIVE TUTOR STRATEGY DIRECTIVES (from Personal Cognitive AI Engine):\n${tutorDirectives}\n` : ''}

YOUR GOAL:
Given a question, produce TWO synchronized outputs in ONE response:
1. THE COMPLETE EDUCATIONAL ANSWER ("matter"): Detailed explanation, key definitions, and final conclusion.
2. THE DETERMINISTIC VISUAL PLAN: Ordered teaching beats with allowlisted visual actions for the canvas.

CORE TEACHING RULES:
- DEFINITIONS & DETAILED NOTES BELONG IN THE "matter" SECTION: Put all concept definitions, formulas, and deep theoretical explanations in the "definitions" array and "explanation" field.
- KEEP THE BOARD CANVAS VISUAL: The blackboard canvas is an infinite visual space for diagrams, graphs, geometric shapes, equations, arrows, data structures, state transitions, and step numbers. Do NOT output large text paragraphs or textbook definitions as canvas actions — the UI displays definitions and written matter in the dedicated Matter Section!
- Visuals must be instructional and synchronized with narration.
- Do NOT output raw code or exact screen coordinates. Use SEMANTIC RELATIONS to position items.
- NEVER output a lone empty rectangle (DRAW_RECTANGLE) and arrow (DRAW_ARROW) for systems, workflows, architectures, processes, or "how things work".
- FOR WORKFLOWS, ARCHITECTURES, PROCESSES, SYSTEM MECHANISMS (e.g. CPU, Compiler, Authentication, Network protocols, or when flowchart/workflow/graph is asked):
  YOU MUST USE "CREATE_FLOWCHART", "CREATE_ARCHITECTURE_DIAGRAM", or "CREATE_BLOCK_DIAGRAM" in the visual plan!
  Provide parameters:
  - "direction": "LR" (left-to-right for sequential pipelines) or "TB" (top-to-bottom for hierarchies).
  - "nodes": Array of 4 to 8 concrete functional components/stages with { "id": "stage_id", "label": "Component Label" }.
    Example for CPU / Processor:
    nodes: [
      { "id": "fetch", "label": "1. Instruction Fetch (PC / Cache)" },
      { "id": "decode", "label": "2. Instruction Decode (Control Unit)" },
      { "id": "execute", "label": "3. Execute (ALU)" },
      { "id": "memory", "label": "4. Memory Access (RAM)" },
      { "id": "writeback", "label": "5. Write Back (Registers)" }
    ]
  - "edges": Array of directional links with { "from": "fetch", "to": "decode", "label": "opcode" }, etc.
- Allowed relations: ${RELATION_TYPES.join(', ')}.
- Allowed gaps: tight, normal, loose.
- Give each visual object a stable target id (e.g. "array_1", "eq_1", "ptr_low", "vector_v") and reuse it to transform/highlight it.
- Keep the explanation complete from start to finish. Never stop halfway.
- COMPREHENSION CHECK REQUIREMENT (EXTREMELY IMPORTANT):
  After the beats, formulate ONE genuinely insightful, concept-testing multiple-choice challenge.
  Rules for a mastery-grade comprehension question:
  * NEVER ask shallow trivia, textbook recall, or definition lookups.
  * Test deep conceptual intuition: pose a counterfactual ("What happens if...", "If we remove..."), an edge condition, or a classic misconception students frequently fall into.
  * Options: Provide 3 or 4 compelling, realistic choices ("a", "b", "c", "d"). The incorrect options ("distractors") MUST represent plausible intuitive reasoning or common pitfalls rather than obviously silly answers.
  * Clearly specify correctOptionId, and provide an illuminating, pedagogical rationale explaining the core intuition behind the answer.

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
  "comprehensionCheck": {
    "question": "One question testing understanding of THIS explanation",
    "options": [
      { "id": "a", "label": "First option" },
      { "id": "b", "label": "Second option" },
      { "id": "c", "label": "Third option" }
    ],
    "correctOptionId": "b",
    "rationale": "One sentence explaining why that option is correct."
  },
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

/**
 * Validate the model's comprehension-check object.
 *
 * Optional by contract: a malformed or missing check is simply dropped,
 * never a reason to fail the whole lesson.
 */
function parseComprehensionCheck(raw: unknown): ComprehensionCheck | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const question = typeof r.question === 'string' ? r.question.trim() : '';
  const rawOptions = Array.isArray(r.options) ? r.options : [];
  const options = rawOptions
    .filter((o): o is Record<string, unknown> => Boolean(o && typeof o === 'object'))
    .map((o) => ({ id: String(o.id ?? '').trim(), label: String(o.label ?? '').trim() }))
    .filter((o) => o.id && o.label);
  const correctOptionId = typeof r.correctOptionId === 'string' ? r.correctOptionId.trim() : '';
  const rationale = typeof r.rationale === 'string' ? r.rationale.trim() : '';

  if (!question || options.length < 2 || !options.some((o) => o.id === correctOptionId)) {
    return undefined;
  }
  return { question, options, correctOptionId, rationale };
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
    maxTokens: 16000,
    maxContinuations: 10,
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

  // Web Research & Component Extraction
  hooks.status('RESEARCHING', 'Extracting technical structure & research sources');
  let webExcerpts = '';
  let discoveredSources: SourceRef[] = [];
  let discoveredVideos: VideoRef[] = [];
  try {
    const researchTask = Promise.all([
      crawl(trimmed, { results: 4, read: 2 }),
      searchYouTube(trimmed, 2),
    ]);
    const timeoutPromise = new Promise<[{ results: any[]; pages: any[] }, any[]]>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 3200)
    );
    const [crawlRes, ytRes] = await Promise.race([researchTask, timeoutPromise]);

    if (crawlRes?.results?.length) {
      discoveredSources = crawlRes.results.map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        source: r.source,
      }));
      const pageSnippets = (crawlRes.pages || [])
        .map((p: any) => p.text.slice(0, 300))
        .filter(Boolean);
      const allSnippets = [
        ...crawlRes.results.map((r: any) => `${r.title}: ${r.snippet}`),
        ...pageSnippets,
      ].slice(0, 5);
      if (allSnippets.length > 0) {
        webExcerpts = allSnippets.join('\n');
      }
    }
    if (Array.isArray(ytRes)) {
      discoveredVideos = ytRes;
    }
  } catch {
    // Non-fatal: continue ungrounded if research times out
  }

  if (hooks.onResearch && (discoveredSources.length > 0 || discoveredVideos.length > 0)) {
    hooks.onResearch({ sources: discoveredSources, videos: discoveredVideos });
  }

  hooks.status('DESIGNING_VISUALS', 'Creating answer & visual plan');

  const contextPrefix = hooks.contextNote ? `Context from the ongoing session:\n${hooks.contextNote}\n\n` : '';
  const workflowGuidance = isWorkflowOrStructure(trimmed)
    ? '\nREQUIREMENT: This question asks for a workflow, architecture, process, or mechanism. Include a complete, detailed CREATE_FLOWCHART or CREATE_ARCHITECTURE_DIAGRAM with all functional stages connected by directional edges. Do NOT output plain empty rectangles or basic arrows!\n'
    : '';
  const webResearchContext = webExcerpts
    ? `\nExtracted Technical Web Structure & Key References:\n${webExcerpts}\n`
    : '';

  const userPrompt = contextPrefix + webResearchContext + workflowGuidance + (
    isEq && solvedAnswer
      ? `Question: "${trimmed}"\nVerified Equation Solution: ${solvedAnswer}\nCreate the complete explanation, definitions, and visual drawing steps.`
      : `Question: "${trimmed}"\nExplain this completely and create the blackboard visual sequence.`
  );

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
    system: fastSystemPrompt(inferredDomain, hooks.tutorDirectives),
    user: userPrompt,
    json: true,
    /*
     * No artificial ceiling: some free/reasoning models were getting cut off
     * a few dozen tokens into the JSON and the continuation loop couldn't dig
     * them out of it. A per-call budget still exists (models need SOME cap to
     * stream against), but it is generous now, and maxContinuations gives a
     * model that is still short of a complete plan many more chances to
     * finish rather than failing on "truncated JSON".
     */
    maxTokens: 16000,
    maxContinuations: 10,
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

  // Workflow / Flowchart enforcement
  if (isWorkflowOrStructure(trimmed)) {
    const isMermaidAction = (type: string) =>
      /^(CREATE_FLOWCHART|CREATE_ARCHITECTURE_DIAGRAM|CREATE_BLOCK_DIAGRAM|CREATE_SEQUENCE_DIAGRAM|CREATE_STATE_DIAGRAM|CREATE_CLASS_DIAGRAM|CREATE_MINDMAP|CREATE_TIMELINE|CREATE_ER_DIAGRAM)$/.test(
        type
      );
    const hasMermaid = validBeats.some((b) => b.visualActions.some((a) => isMermaidAction(a.type)));

    if (!hasMermaid) {
      // Synthesize flowchart and clean up any placeholder rectangles/arrows
      const flowchartAction = synthesizeWorkflowFlowchart(trimmed, definitions, webExcerpts);
      for (const beat of validBeats) {
        beat.visualActions = beat.visualActions.filter(
          (a) => a.type !== 'DRAW_RECTANGLE' && a.type !== 'DRAW_ARROW' && a.type !== 'DRAW_SQUARE'
        );
      }
      const targetBeatIndex = validBeats.length > 1 ? 1 : 0;
      if (validBeats[targetBeatIndex]) {
        flowchartAction.beatId = validBeats[targetBeatIndex].beatId;
        validBeats[targetBeatIndex].visualActions.push(flowchartAction);
      }
    } else {
      // Remove any redundant lone DRAW_RECTANGLE / DRAW_ARROW that might accompany the flowchart
      for (const beat of validBeats) {
        if (beat.visualActions.some((a) => isMermaidAction(a.type))) {
          beat.visualActions = beat.visualActions.filter(
            (a) => a.type !== 'DRAW_RECTANGLE' && a.type !== 'DRAW_ARROW' && a.type !== 'DRAW_SQUARE'
          );
        }
      }
    }
  }

  const domain = normaliseDomain(parsed.domain);
  const comprehensionCheck = parseComprehensionCheck(parsed.comprehensionCheck);

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
    ...(comprehensionCheck ? { comprehensionCheck } : {}),
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
