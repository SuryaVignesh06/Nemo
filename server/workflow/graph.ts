/**
 * NEMO — the agent graph.
 *
 *   solver -> director -> planner -> composer -> compile -> render -> critic
 *                                        ^                              |
 *                                        |                     PASS -> narrate -> END
 *                                        |                              |
 *                                     repair <------------------- REPAIR_REQUIRED
 *
 * This file and state.ts are the only LangGraph-aware parts of the backend.
 * Every node delegates to an agent function or a deterministic service, so the
 * graph describes control flow and nothing else.
 *
 * Two invariants the routing enforces:
 *
 *   1. The repair cycle is bounded by maxIterations. When the budget runs out
 *      the workflow finishes with the best composition it saw, plus a warning —
 *      it never loops and never returns nothing.
 *   2. A FATAL review does not attempt repair. If the render contradicts the
 *      answer outright, another layout pass will not save it.
 */

import { END, START, StateGraph } from '@langchain/langgraph';

import { LessonError } from '../../shared/contracts.ts';
import { orderIssues } from '../../shared/agents.ts';
import { runComposer, runComposerRepair } from '../agents/composer.ts';
import { runCritic } from '../agents/critic.ts';
import { runDirector } from '../agents/director.ts';
import { runPlanner } from '../agents/planner.ts';
import { runRepair } from '../agents/repair.ts';
import { runSolver } from '../agents/solver.ts';
import type { AgentDeps } from '../agents/types.ts';
import { deterministicFailures, type RenderEvidence } from '../rendering/evidence.ts';
import { compileComposition } from './compile.ts';
import { NemoState, type NemoStateType, type NemoStateUpdate } from './state.ts';
import type { LessonPlan } from '../../shared/contracts.ts';

/**
 * Produces render evidence for a compiled plan. Injected so the graph does not
 * depend on any particular renderer — ManimGL in production, a deterministic
 * stub in tests.
 */
export interface RenderService {
  render(plan: LessonPlan, signal?: AbortSignal): Promise<RenderEvidence>;
}

export interface GraphDeps extends AgentDeps {
  renderer: RenderService;
  /** Skips the critic entirely when no vision-capable model is configured. */
  criticEnabled: boolean;
}

/* ----------------------------------------------------------------- nodes */

function requireState<K extends keyof NemoStateType>(
  state: NemoStateType,
  key: K,
  node: string
): NonNullable<NemoStateType[K]> {
  const value = state[key];
  if (value === null || value === undefined) {
    throw new LessonError('INCOMPLETE_PLAN', `${node} ran without ${String(key)}.`);
  }
  return value as NonNullable<NemoStateType[K]>;
}

export function buildGraph(deps: GraphDeps) {
  const graph = new StateGraph(NemoState)

    .addNode('solver', async (state): Promise<NemoStateUpdate> => {
      const answer = await runSolver(deps, state.question);
      return { answer, status: 'SOLVING', visited: ['solver'] };
    })

    .addNode('director', async (state): Promise<NemoStateUpdate> => {
      const answer = requireState(state, 'answer', 'director');
      const teaching = await runDirector(deps, state.question, answer);
      return { teaching, status: 'PLANNING', visited: ['director'] };
    })

    .addNode('planner', async (state): Promise<NemoStateUpdate> => {
      const teaching = requireState(state, 'teaching', 'planner');
      const visual = await runPlanner(deps, teaching);
      return { visual, status: 'DESIGNING_VISUALS', visited: ['planner'] };
    })

    .addNode('composer', async (state): Promise<NemoStateUpdate> => {
      const teaching = requireState(state, 'teaching', 'composer');
      const visual = requireState(state, 'visual', 'composer');
      const composition = await runComposer(deps, teaching, visual);
      return { composition, status: 'COMPOSING', visited: ['composer'] };
    })

    /* ------------------------------------------------ deterministic nodes */

    .addNode('compile', async (state): Promise<NemoStateUpdate> => {
      deps.status('VALIDATING', 'Checking the visual plan');
      const answer = requireState(state, 'answer', 'compile');
      const teaching = requireState(state, 'teaching', 'compile');
      const composition = requireState(state, 'composition', 'compile');

      try {
        const { plan, warnings } = compileComposition(
          { lessonId: state.lessonId, requestId: state.requestId },
          state.question,
          answer,
          teaching,
          composition
        );
        return { lessonPlan: plan, warnings, status: 'VALIDATING', visited: ['compile'] };
      } catch (err) {
        // A repair that produces an invalid composition must not destroy a
        // lesson that already compiled. Keep the last good plan and stop
        // repairing; a worse-but-working lesson beats no lesson.
        if (!state.lessonPlan) throw err;
        return {
          warnings: [
            `Repair pass ${state.iteration} produced an invalid composition and was discarded: ${
              (err as Error).message
            }`,
          ],
          // Exhaust the budget so routing sends us to finish.
          iteration: state.maxIterations,
          status: 'VALIDATING',
          visited: ['compile:rejected'],
        };
      }
    })

    .addNode('render', async (state): Promise<NemoStateUpdate> => {
      deps.status('RENDERING', 'Drawing the lesson');
      const plan = requireState(state, 'lessonPlan', 'render');
      const evidence = await deps.renderer.render(plan, deps.signal);
      return { evidence, status: 'RENDERING', visited: ['render'] };
    })

    /* ------------------------------------------------------ review cycle */

    .addNode('critic', async (state): Promise<NemoStateUpdate> => {
      const answer = requireState(state, 'answer', 'critic');
      const teaching = requireState(state, 'teaching', 'critic');
      const composition = requireState(state, 'composition', 'critic');
      const evidence = requireState(state, 'evidence', 'critic');

      // Measured defects fail the scene regardless of what a model thinks, and
      // still work when no vision model is configured at all.
      const hardFailures = deterministicFailures(evidence.measurements);

      if (!deps.criticEnabled) {
        const passed = hardFailures.length === 0;
        return {
          review: {
            status: passed ? 'PASS' : 'REPAIR_REQUIRED',
            score: passed ? 0.7 : 0.3,
            correctnessScore: 0.7,
            compositionScore: passed ? 0.7 : 0.3,
            readabilityScore: passed ? 0.7 : 0.2,
            pedagogicalScore: 0.7,
            issues: hardFailures.map((d) => ({
              category: 'LAYOUT' as const,
              severity: 'MAJOR' as const,
              description: d,
              targets: [],
            })),
            strengths: [],
            repairRecommendations: hardFailures,
          },
          status: 'REVIEWING',
          visited: ['critic:deterministic'],
        };
      }

      const review = await runCritic(
        deps,
        state.question,
        answer,
        teaching,
        composition,
        evidence
      );

      // The model may not overrule a measurement. If geometry is provably
      // broken, the scene needs repair whatever the review said.
      const merged =
        hardFailures.length && review.status === 'PASS'
          ? {
              ...review,
              status: 'REPAIR_REQUIRED' as const,
              issues: [
                ...review.issues,
                ...hardFailures.map((d) => ({
                  category: 'LAYOUT' as const,
                  severity: 'MAJOR' as const,
                  description: d,
                  targets: [],
                })),
              ],
            }
          : review;

      const better = merged.score > state.bestScore;
      return {
        review: merged,
        ...(better ? { bestComposition: composition, bestScore: merged.score } : {}),
        status: 'REVIEWING',
        visited: ['critic'],
      };
    })

    .addNode('repair_pass', async (state): Promise<NemoStateUpdate> => {
      const review = requireState(state, 'review', 'repair');
      const teaching = requireState(state, 'teaching', 'repair');
      const composition = requireState(state, 'composition', 'repair');

      const repair = await runRepair(deps, review, composition);
      const revised = await runComposerRepair(deps, teaching, composition, repair);

      const top = orderIssues(review.issues)[0];
      return {
        repair,
        composition: revised,
        iteration: state.iteration + 1,
        status: 'REPAIRING',
        warnings: [
          `Repair pass ${state.iteration + 1}: ${repair.summary}` +
            (top ? ` (led by ${top.category})` : ''),
        ],
        visited: ['repair'],
      };
    })

    .addNode('finish', async (state): Promise<NemoStateUpdate> => {
      // Fall back to the best-scoring composition if the last pass was worse.
      const useBest =
        state.bestComposition !== null &&
        state.review !== null &&
        state.bestScore > state.review.score;

      if (!useBest) return { status: 'READY', visited: ['finish'] };

      const answer = requireState(state, 'answer', 'finish');
      const teaching = requireState(state, 'teaching', 'finish');
      const { plan, warnings } = compileComposition(
        { lessonId: state.lessonId, requestId: state.requestId },
        state.question,
        answer,
        teaching,
        state.bestComposition!
      );
      return {
        lessonPlan: plan,
        composition: state.bestComposition,
        warnings: [...warnings, 'Returned the best-scoring earlier attempt.'],
        status: 'READY',
        visited: ['finish'],
      };
    });

  /* ---------------------------------------------------------------- edges */

  graph
    .addEdge(START, 'solver')
    .addEdge('solver', 'director')
    .addEdge('director', 'planner')
    .addEdge('planner', 'composer')
    .addEdge('composer', 'compile')
    .addEdge('compile', 'render')
    .addEdge('render', 'critic')
    .addConditionalEdges('critic', routeAfterCritic, {
      repair: 'repair_pass',
      finish: 'finish',
    })
    // A repaired composition re-enters the deterministic path, never the agents.
    .addEdge('repair_pass', 'compile')
    .addEdge('finish', END);

  return graph.compile();
}

/**
 * PASS finishes. FATAL finishes — a broken render is not a layout problem.
 * Otherwise repair, while the iteration budget lasts.
 */
export function routeAfterCritic(state: NemoStateType): 'repair' | 'finish' {
  const review = state.review;
  if (!review) return 'finish';
  if (review.status === 'PASS' || review.status === 'FATAL') return 'finish';
  if (state.iteration >= state.maxIterations) return 'finish';
  return 'repair';
}
