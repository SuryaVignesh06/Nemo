# NEMO

**An AI visual teacher.** You ask a question; Nemo works out the answer, plans how to teach it, and
then draws the explanation live on a black infinite canvas — handwriting, diagrams, camera moves and
ElevenLabs narration — while you watch.

It is deliberately not a chatbot that returns text with a picture attached.

```
npm install
npm run dev          # http://localhost:5173
```

Open the app, click the pill in the top right, pick a provider and paste a key. Or pick **Demo Mode**
and ask one of the three scripted questions with no key at all.

Try:

- `Explain binary search.`
- `2x + 5 = 17`
- `Explain the area of a triangle.`

---

## The core design decision

The model never generates rendering code. Not Python, not Manim, not JavaScript, not SVG.

```
LLM reasoning
     ↓
Semantic Visual Plan          ← the model's only output vocabulary
     ↓
Predefined visual capabilities ← application code decides what each one means
     ↓
Deterministic geometry + layout
     ↓
Live scene
```

The model says:

```json
{
  "type": "DRAW_CIRCLE",
  "semanticRole": "current_midpoint",
  "target": "midpoint-marker",
  "relations": [{ "type": "ATTACHED_TO", "target": "array" }],
  "priority": "PRIMARY",
  "timing": { "pace": "deliberate" }
}
```

`src/scene/execute.ts` decides what `DRAW_CIRCLE` actually draws. The model gets the *what*; the
application keeps the *how*, the coordinates, and the timing. That makes the system safe,
deterministic, visually consistent, and debuggable — and nothing the model writes is ever executed.

---

## Architecture

```
                    ┌──────────────────┐
                    │   Black canvas   │
                    └────────┬─────────┘
  question                   │
  ─────────────────────────► │
                             ▼
                      Backend API  (Node, mounted in Vite)
                             ▼
                     Z.AI / OpenRouter / Gemini
                             ▼
              ┌──────────────────────────────┐
              │  QUESTION ANALYZER           │  domain, intent, is-this-an-equation
              │  PROBLEM SOLVER              │  deterministic for equations
              │  TEACHING PLANNER            │  beats, narration
              │  VISUAL DIRECTOR             │  semantic visual actions
              └──────────────┬───────────────┘
                             ▼
                    VISUAL VALIDATION            reject raw code / coordinates /
                             ▼                   unknown capabilities / incomplete plans
                    validated LessonPlan
                             ▼   (SSE)
              ┌──────────────┴───────────────┐
              ▼                              ▼
        Live scene engine              Manim compiler
        (browser, per action)          (offline, optional)
              ▼                              ▼
        scene store → layout           controlled Mobjects
              ▼                              ▼
        progressive ink + pen          rendered video
              ▼
        canvas  +  ElevenLabs narration
```

Four model roles, four separate calls. They share a provider but never a response — one prompt doing
everything is what makes a failure impossible to debug.

### Where the authority lives

| Concern | Owner | Why |
| --- | --- | --- |
| Arithmetic on equations | `shared/solver.ts` | A real parser and solver. The model narrates the steps it is given; it never gets to be wrong about the maths. |
| What capabilities exist | `shared/registry.ts` | A closed catalog transcribed from the two registry documents. Unknown names fail loudly. |
| What is safe to run | `shared/validate.ts` | Every model response is untrusted data. |
| Where things go | `src/scene/store.ts` | Semantic relations in, coordinates out. The model never places anything. |
| What each action draws | `src/scene/execute.ts` | The whole point of the design. |
| When things happen | `src/presenter/presenter.ts` | Real durations, one action at a time. |

---

## Repository layout

```
shared/                 contracts shared by backend and browser
  registry.ts           the 377-capability semantic catalog (92 executable)
  contracts.ts          LessonPlan, TeachingBeat, VisualAction, SceneNode, events
  validate.ts           AI output constraints (registry §31)
  solver.ts             deterministic linear equation solver

server/                 the backend (Node, TypeScript, no framework)
  app.ts                /api/lesson (SSE), /api/solve, /api/voice, /api/health, /api/registry
  standalone.ts         run the API on its own port
  providers/index.ts    Z.AI, OpenRouter, Gemini, Mock + failure taxonomy
  lesson/prompts.ts     the four staged system prompts
  lesson/pipeline.ts    analyzer → solver → planner → director → validation
  lesson/mockPlans.ts   the three scripted Demo Mode lessons
  voice/index.ts        ElevenLabs

src/                    the browser app (React, Vite)
  handwriting/glyphs.ts stroke-based font: letters, digits, operators
  handwriting/strokes.ts seeded ink generation, shape builders
  scene/store.ts        authoritative scene state, layout, anti-overlap
  scene/execute.ts      semantic action → ink + animation
  presenter/presenter.ts live playback
  presenter/voice.ts    narration (ElevenLabs only)
  canvas/BoardCanvas.tsx the board, progressive drawing, the pen, pan/zoom
  components/           ask bar, config panel, status strip

manim/                  optional advanced backend
  nemo_compiler.py      controlled capability → Mobject adapters
  extract_plan.py       pull a validated plan out of the SSE stream

tests/                  70 tests, `npm test`
```

---

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies. |
| `npm run dev` | Frontend **and** backend on http://localhost:5173. This is the demo. |
| `npm test` | 70 tests (`node --test`, no test framework dependency). |
| `npm run typecheck` | `tsc -b` across app, backend and tests. |
| `npm run lint` | oxlint. |
| `npm run api` | Run the backend alone on `PORT` (default 8787). |
| `npm run build` | Production client bundle. |

The backend runs as Vite middleware (`nemoApi()` in `vite.config.ts`). It is a real Node server —
it holds the keys, calls the providers and streams SSE — it just shares a process with the dev
server so the demo is one command.

---

## Configuration

Everything is optional. Two ways to supply a key:

**In the browser** — the pill in the top right. Keys live in that browser's `localStorage` and travel
to the local backend with each request. They are never bundled into the client and never logged.

**On the server** — copy `.env.example` to `.env`. Used whenever the browser field is blank.

| Variable | Purpose |
| --- | --- |
| `NEMO_PROVIDER` | `zai` (default), `openrouter`, `gemini`, `mock` |
| `ZAI_API_KEY`, `ZAI_MODEL`, `ZAI_BASE_URL` | Z.AI, the primary provider. Default model `glm-4.6`. |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | Alternate. |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Alternate. |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Narration. |

### Voice

ElevenLabs is the only voice. If it is missing or fails, the config pill reads **VOICE UNAVAILABLE**
and the lesson continues silently. `window.speechSynthesis` is never used — a different voice
appearing unasked is a worse failure than silence, and a test asserts the code has no such path.

### Demo Mode

Explicitly selectable, never automatic. It serves three deterministic lessons offline: binary search,
any linear equation (solved for real, not scripted), and the area of a triangle. Ask it anything else
and it says so. A live provider that fails reports its failure — it never falls back to a scripted
lesson, because showing an unrelated scene is worse than showing an error.

---

## API

| Route | Purpose |
| --- | --- |
| `POST /api/lesson` | SSE stream: `lesson.started`, `lesson.status` per stage, `lesson.plan`, or `lesson.failed`. |
| `POST /api/solve` | `{ "question": "2x + 5 = 17" }` → structured solution steps. |
| `POST /api/voice` | Narration audio from ElevenLabs. |
| `GET /api/health` | Which providers have keys (never the keys), voice reachability, capability counts. |
| `GET /api/registry` | The full semantic capability catalog. |

```bash
curl -sN -X POST http://localhost:5173/api/lesson \
  -H 'Content-Type: application/json' \
  -d '{"question":"Explain binary search.","provider":{"provider":"mock"}}'
```

---

## How the visuals work

**Everything is ink.** Text, equations, circles, arrays and arrows all reduce to `InkStroke`
polylines. That is why progressive drawing, the pen, and the anti-overlap engine are each written
once instead of per shape.

**Handwriting** is a stroke font (`src/handwriting/glyphs.ts`) — each glyph is the sequence of pen
strokes a hand would make, not an outline. Wobble is seeded from `lessonId + nodeId + strokeIndex`,
so the same lesson always produces byte-identical ink. Tested.

**Layout** takes semantic relations (`ABOVE`, `BELOW`, `ATTACHED_TO`, `INSIDE`…) and resolves real
coordinates, then runs anti-overlap: on a collision the lower-priority node moves, so `PRIMARY`
content is never displaced by a label. Deliberate nesting — a height line inside a triangle, a circle
around a formula — is tracked as an attachment and exempted, transitively.

**The pen** follows the real ink frontier: the renderer interpolates the exact point along the stroke
being drawn and puts the nib there. It is not a decorative sprite on a fake path.

**The camera** tweens between framings computed from content bounds. Drag to pan, scroll to zoom.

---

## Manim (optional)

The browser owns the live board — that is what makes the demo feel like a teacher drawing. The Manim
path renders the *same validated plan* offline at higher fidelity.

```bash
pip install manim          # Community edition; needs FFmpeg, and LaTeX for MathTex
curl -sN -X POST http://localhost:5173/api/lesson \
  -H 'Content-Type: application/json' \
  -d '{"question":"Explain binary search.","provider":{"provider":"mock"}}' \
  | python manim/extract_plan.py > plan.json
python manim/nemo_compiler.py            # report adapter coverage for the plan
manim -ql manim/nemo_compiler.py NemoLesson
```

`nemo_compiler.py` maps allowlisted capabilities to Mobjects (`DRAW_CIRCLE` → `Circle`,
`DRAW_ARROW` → `Arrow`, `DRAW_ARRAY` → a `VGroup` of cells, `HIGHLIGHT` → `Indicate`). There is no
`eval`, no `exec`, and no path where a model string becomes Python. An action with no adapter raises
`UnsupportedAction` rather than rendering something else.

ManimGL is not used. A 2D algebra demo should not depend on an OpenGL setup.

---

## Requirements

| | |
| --- | --- |
| Node | 22.6+ (this was built on 24.12). The backend and tests use Node's native TypeScript stripping, so there is no build step for server code. |
| npm | 9+ |
| Browser | Any current Chrome, Edge, Firefox or Safari. |
| Python | 3.10+ — **only** for the optional Manim path. |
| Manim | Optional. Community edition, plus FFmpeg. |
| LaTeX | Optional, and only if you extend the compiler to use `MathTex`. |

---

## Security posture

Model output is untrusted data throughout.

- **No raw code.** Python, Manim, JS, SVG, HTML, shell and fenced blocks are pattern-matched and
  rejected anywhere in a response, including nested fields.
- **No coordinates.** `x`, `y`, `position` and friends are stripped from parameters and the removal
  is reported. Layout owns placement.
- **Closed vocabulary.** An action type outside the registry fails with `REJECT_UNKNOWN_CAPABILITY`.
  A catalogued capability with no executor is refused too, rather than silently skipped.
- **No silent drops.** A rejected action is recorded; if a beat ends up with nothing to draw, the
  plan fails validation instead of playing a lesson with a hole in it.
- **Complete plans only.** "etc.", "continue similarly" and a final beat that never concludes are
  all rejection reasons.
- **Stale requests.** Every lesson carries a `requestId`. Asking a second question aborts the first
  on the server and makes the client ignore any late events from it. The newest request wins.
- **Keys.** Never in the bundle, never logged, never returned by `/api/health`.

---

## Known limitations

- **Model quality is the ceiling on a live provider.** Validation guarantees a plan is safe and
  structurally complete; it cannot guarantee a weak model chose a good sequence of visuals. The
  scripted Demo Mode lessons are the ones tuned by hand.
- **The handwriting font is approximate.** Recognisable and teacher-like, not calligraphic. Unknown
  characters render as a visible box rather than disappearing.
- **`PLOT_FUNCTION` recognises named shapes** (linear, quadratic, log, sin, exp…) rather than
  evaluating an arbitrary expression — evaluating a model-supplied formula is exactly the door this
  design keeps shut.
- **Narration is beat-level.** Audio starts with a beat and the visuals run alongside; there is no
  word-level sync.
- **Text-only input.** No image upload or annotation — the registry catalogs those capabilities but
  they have no executor in this build.
- **No persistence.** A new question clears the board; reloading loses the lesson.
- **Single lesson at a time**, in-memory, no auth, no database.
