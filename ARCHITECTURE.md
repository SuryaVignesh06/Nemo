# NEMO — agentic architecture

How a question becomes a rendered, reviewed lesson, and which parts are allowed
to be non-deterministic.

## The shape of it

```
LangGraph                 control flow only
    ↓
Nemo typed contracts      shared/agents.ts — Zod, no LangGraph types
    ↓
Semantic Visual IR        shared/contracts.ts + shared/registry.ts
    ↓
Deterministic systems     shared/validate.ts, layout, compiler
    ↓
ManimGL                   manim/nemo_compiler.py
```

The orchestrator is replaceable. The semantic visual language is not. Only
`server/workflow/state.ts` and `server/workflow/graph.ts` import LangGraph;
swapping orchestrators means rewriting those two files and nothing else.

## The graph

```
START
  → solver         "what is correct?"            AnswerArtifact
  → director       "how should this be taught?"  TeachingPlan
  → planner        "what should be shown?"       VisualPlan
  → composer       "how should it be composed?"  SceneCompositionPlan
  → compile        deterministic → LessonPlan
  → render         deterministic → frames + measured geometry
  → critic         "is the result good?"         VisualReview
       ├── PASS / FATAL / budget exhausted → finish → END
       └── REPAIR_REQUIRED → repair_pass → compile → render → critic
```

Repair re-enters at `compile`, never back through the solver or director. A
lesson's *content* is decided once; repair only adjusts its *presentation*.

## Where the boundary sits

Agents decide intent. Deterministic code decides execution.

| Deterministic (never an agent) | Why |
| --- | --- |
| Capability registry | The model picks from a list it is given, so it cannot invent `SUMMON_DRAGON`. |
| Action validation | One validator (`shared/validate.ts`), reused by both the legacy pipeline and the compiler. Two validators would eventually disagree, and the weaker one would become the security boundary. |
| Coordinates and layout | Agents express `BELOW graph_1, gap: normal`. Geometry is resolved after them. |
| Scene measurement | Overlap, clipping, off-screen and unreadable size are computed from real bounds. |
| ManimGL compilation | The only component that emits renderer instructions. |
| Linear-equation arithmetic | The solver narrates steps it is given; it never gets to be wrong about the numbers. |

Nothing the model writes is ever executed. There is no `eval`, no `exec`, no
subprocess argument built from model output. The plan is written to a file as
JSON data and read back as data.

## Model reliability

`server/models/execution.ts` is the single path for every model call.

- **Empty output is failure.** HTTP 200 with whitespace content is
  `EMPTY_OUTPUT` and retried, never returned as an answer.
- **Retry only what a retry can fix.** Transient network, timeout, rate limit
  and empty output retry with exponential backoff plus full jitter.
  Authentication, cancellation and validation errors do not — repeating an
  identical prompt reproduces an identical mistake.
- **Schema failures get a repair prompt**, not a retry: the model is shown its
  own output and the specific Zod paths that failed.
- **Fallback is opt-in and recorded.** A different model is only used after the
  primary is exhausted, and the swap always appears in the trace.
- **Cancellation wins immediately** and is never retried or failed over.

Error classes are kept on a separate axis from the existing user-facing
`FailureCode`, because "descriptive" and "worth retrying" are different
questions.

## The critic

The critic judges the render, not the JSON that produced it. It receives:

1. **Captured frames** — sampled across the clip, not only the final one.
2. **Measured geometry** — from `bounds.json`, emitted by the compiler after
   layout from real mobject extents.
3. The question, the correct answer, and the lesson objective.

Facts and judgement are deliberately split. Vision models are good at "the arrow
points at the wrong atom" and unreliable at "these overlap by 40 pixels", so
geometry is measured and handed over as fact. Two consequences:

- A model `PASS` is **overridden** when geometry is provably broken.
- With no vision model configured (`NEMO_VISION_CRITIC=0`), the critic still
  runs on measurements alone. The loop degrades; it does not stop.

The critic never edits the scene. That is the Repair Agent's job, and keeping
them separate is what stops the critic quietly rewriting the lesson it was asked
to judge.

## Repair

`RepairPlan` is a closed set of semantic operations — `REPOSITION`, `RESIZE`,
`CAMERA_FIT`, `CAMERA_FOCUS`, `SEQUENCE`, `RETIME`, `REMOVE`, `EMPHASIZE`,
`DEEMPHASIZE`. Issues are pre-sorted deterministically before the model sees
them: correctness, visibility, overlap, layout, camera, timing, aesthetics.

The budget is hard (`VISUAL_REPAIR_MAX_ITERATIONS`, default 2). On exhaustion
the workflow returns the best-scoring composition it saw plus a warning. A
repair that produces an invalid composition is discarded and the last good
lesson is kept — a worse-but-working lesson beats no lesson.

## Renderer

3b1b **ManimGL** (`manimgl` / `manimlib` 1.7.2), not Manim Community. The
differences that bite:

- `ShowCreation`, not `Create`.
- `Tex`, not `MathTex` — and model strings are rendered as `Text` regardless,
  because handing a model string to a TeX compiler turns content into a command.
- No `@dataclass` in a scene file: ManimGL's `ModuleLoader` leaves
  `sys.modules[__module__]` as `None`, which breaks dataclass field resolution.

An action with no adapter is refused loudly rather than rendered as something
unrelated.

## Request isolation

Every request carries `requestId`, `sessionId` and `lessonId`. A new question
aborts the previous workflow for that session; the signal reaches every model
call and the renderer subprocess. The browser independently ignores events whose
`requestId` is not the newest. A stale workflow cannot overwrite a newer lesson.

## Observability

`WorkflowTrace` records provider, model, attempt, duration, status and error
class per stage, and renders the per-stage report the build brief asks for.
`trace.format()` names the component that failed rather than the pipeline. Raw
model text is retained only under `NEMO_DEBUG=1`, truncated. API keys are never
logged.

## Commands

```
npm run dev                 # app + backend on :5173
npm run health              # provider, renderer, voice, registry, workflow
npm run graph               # print the agent graph
npm run demo -- all         # four acceptance scenarios
npm test                    # full suite
NEMO_RENDER_TEST=1 npm test # includes live ManimGL render + end-to-end
```
