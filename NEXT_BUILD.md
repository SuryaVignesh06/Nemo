# NEMO — Build Handoff & Next-Build Plan

**Status of this document:** written at the end of build session 1. Nothing in the codebase was
changed after the last verification run described below.

**Read this first if you are picking the project up.** It tells you exactly what exists, what is
proven to work, what is unproven, what is broken, and what to build next in priority order.

---

## 0. TL;DR — where the project actually stands

The MVP is **functional end to end in Demo Mode**. A learner types a question, the backend produces a
validated semantic lesson plan, and the browser draws it live on a black canvas with handwriting,
diagrams, pointers, camera moves and a pen — and the lesson reaches a real `COMPLETED` state.

What is **not** proven: the live-model path (Z.AI / OpenRouter / Gemini) has never been run with a
real API key, and ElevenLabs narration has never been heard. Those are the two biggest risks and
they are items **N1** and **N2** below.

| | |
| --- | --- |
| Tests | 71 passing (`npm test`) |
| Typecheck | Clean (`npm run typecheck`) |
| Lint | 10 warnings, 0 errors (`npm run lint`) |
| Browser | Binary search **verified in Chromium**, reached `Completed` |
| Manim | **Verified** — rendered a real 557 KB MP4, 39 animations |
| Live LLM | **NOT VERIFIED** — no key was available |
| Voice | **NOT VERIFIED** — no key was available |

---

## 1. What was built (session 1)

### 1.1 Shared contracts and the capability registry — `shared/`

| File | What it is |
| --- | --- |
| `registry.ts` | The closed semantic capability catalog, transcribed from both registry PDFs. **377 capabilities** across 32 sections; **92 have executors** in this build. Aliases (`DRAW_GRAPH` → `PLOT_FUNCTION`) resolve to canonical types. |
| `contracts.ts` | `LessonPlan`, `TeachingBeat`, `VisualAction`, `SceneNode`, `InkStroke`, `LessonEvent`, the `FailureCode` taxonomy, and the `LessonError` class. |
| `validate.ts` | Enforces registry §31: rejects raw code, strips model-supplied coordinates, rejects unknown/non-executable capabilities, rejects incomplete plans and placeholder phrasing ("etc.", "continue similarly"), requires the final beat to conclude. |
| `solver.ts` | A **real** recursive-descent linear-equation parser and solver. Handles coefficients, constants, parentheses, unary minus, division, variables on both sides. Verifies every answer by substitution. |

The critical property, implemented throughout: **the model never emits executable code and never owns
a coordinate.** It picks capability names from a closed list and describes semantic relations.

### 1.2 Backend — `server/`

| File | What it is |
| --- | --- |
| `app.ts` | HTTP surface: `POST /api/lesson` (SSE), `POST /api/solve`, `POST /api/voice`, `GET /api/health`, `GET /api/registry`. Stale-request protection via an in-flight `AbortController` per session. Never logs or echoes keys. |
| `standalone.ts` | Runs the API on its own port (`npm run api`), with a dependency-free `.env` loader. |
| `providers/index.ts` | Z.AI (primary, OpenAI-compatible, default `glm-4.6`), OpenRouter, Gemini, and an explicit Mock. Maps HTTP status → `MISSING_CREDENTIALS` / `RATE_LIMIT` / `UNAVAILABLE` / `TIMEOUT`. Includes a robust `extractJson` that survives fences, prose and braces inside strings. |
| `lesson/prompts.ts` | The four staged system prompts. The Visual Director prompt embeds the generated capability sheet, the relation vocabulary and the priority model. |
| `lesson/pipeline.ts` | `analyze → solve → plan → direct → validate`. Equations bypass the model's arithmetic entirely and use `shared/solver.ts`. |
| `lesson/mockPlans.ts` | Three deterministic offline lessons. The equation plan is **generated from the solver**, so Demo Mode solves any linear equation, not just the scripted one. |
| `voice/index.ts` | ElevenLabs only. No browser-speech fallback anywhere. |

The backend runs as **Vite middleware** (`nemoApi()` in `vite.config.ts`) so the demo is one command,
while still being a real Node server that holds the keys.

### 1.3 Frontend — `src/`

| File | What it is |
| --- | --- |
| `handwriting/glyphs.ts` | A stroke-based font: every glyph is the sequence of pen strokes a hand makes. Full A–Z, a–z, 0–9, and ~30 operators/punctuation. |
| `handwriting/strokes.ts` | Seeded RNG (FNV-1a + mulberry32), Catmull-Rom smoothing, low-frequency wobble, and shape builders (circle, ellipse, arc, line, polyline, rect, arrow, brace, highlight band). |
| `scene/store.ts` | Authoritative scene state. Relation-based placement, priority-ordered anti-overlap with a minimum-translation-vector solver, transitive attachment exemption, camera framing, `checkCollisions` PASS/FAIL. |
| `scene/execute.ts` | The heart of the design: ~70 `case` branches turning each allowlisted capability into ink + an animation description. |
| `presenter/presenter.ts` | Live playback. One action at a time with real durations; every action reaches `COMPLETED` / `FAILED` / `CANCELLED`. |
| `presenter/voice.ts` | Narration playback with per-beat prefetch. |
| `canvas/BoardCanvas.tsx` | The board. Progressive ink by stroke length, a pen that rides the real ink frontier, pan/zoom, dot grid. |
| `components/` | `AskBar` (hero → docked), `ConfigPanel` (top-right pill), `StatusStrip` (stage, beat/action counters, execution log). |
| `hooks/` | `useSettings` (localStorage config), `useLesson` (SSE consumption + presenter driving). |

### 1.4 Manim backend — `manim/`

`nemo_compiler.py` maps allowlisted capabilities to Mobjects through a fixed `ADAPTERS` table.
No `eval`, no `exec`, no path from a model string to Python. `extract_plan.py` pulls a validated plan
out of the SSE stream.

### 1.5 Dev tooling — `scripts/`

`snapshot.ts` + `snapshot.py` rasterise the scene engine's output to PNG headlessly. This is how the
three scenarios were visually verified without a browser, and it is the fastest way to check a
layout change.

```bash
node scripts/snapshot.ts binary | python scripts/snapshot.py board.png
```

---

## 2. Verification status — be precise about this

### VERIFIED ✅

| What | Evidence |
| --- | --- |
| 71 tests pass | `node --test tests/*.test.ts` — 0 failures |
| Typecheck clean | `tsc -b --force` — no output |
| Equation solver correct | `2x+5=17 → x=6`, `3(x-2)=9 → x=5`, `x/2+3=8 → x=10`, `4x+3=x+18 → x=5`, `-2x+1=9 → x=-4`, all verified by substitution |
| Backend endpoints | `curl` against `/api/health`, `/api/solve`, `/api/registry` — all correct |
| SSE lesson stream | All three scenarios streamed: 11 beats/31 actions, 4/14, 7/16. Zero beats with no actions. |
| Scene engine | 26 scene tests: every action reaches an executor, every node has real ink and resolved placement, no protected overlaps, deterministic ink across replays |
| Visual output | Three PNG snapshots inspected — handwriting readable, geometry correct, layout clean |
| **Live browser** | **Chromium: "Explain binary search." reached `Completed`.** Full lesson drawn, pointers on correct cells, found cell highlighted, `O(log n)` circled, summary written |
| Manim render | `media/videos/nemo_compiler/480p15/nemo_binary_search.mp4`, 557 KB, 39 animations, exit 0 |
| Demo Mode refusal | Unscripted question → explicit `UNSUPPORTED`, never an unrelated scene |

### NOT VERIFIED ❌

| What | Why | Risk |
| --- | --- | --- |
| **Z.AI live path** | No API key available in this environment | **HIGH** — the whole live-model pipeline is untested against a real model |
| **OpenRouter / Gemini** | Same | MEDIUM |
| **ElevenLabs narration** | No API key | **HIGH** — no audio has ever played |
| Browser: equation + triangle | The Chromium run was interrupted after binary search | LOW — engine-level tests and PNG snapshots cover the same rendering |
| Stale-request guard in the browser | Test interrupted before that step | MEDIUM — server-side logic is sound but the UI path is unproven |
| Progressive-drawing sampling | Interrupted; early-vs-final screenshots exist and differ, but no numeric series | LOW |
| Console-error sweep | Interrupted before the report was written | MEDIUM |
| Production build (`npm run build`) | Never run | MEDIUM — the API is dev-server middleware only; see **N7** |

---

## 3. Known defects — fix these first

### D1. The narration caption and ask bar cover the bottom of the board 🔴

**Seen in the Chromium screenshot.** `O(log n)` and the summary line are partly hidden behind the
narration caption (`.narration`, `bottom: 104px`) and the ask bar. The spec explicitly requires
"verify canvas is not obstructed" (§66).

**Fix:** make the camera framing viewport-aware — reserve the bottom ~200px and the top ~70px as
non-content area. `cameraForBounds` in `src/scene/store.ts` takes a viewport; pass it an *effective*
viewport that excludes the chrome, or add a `safeInsets` parameter. Also consider auto-hiding the
narration caption a second after the beat's audio ends.

### D2. Highlight bands over thin markers read as blocks 🟡

`HIGHLIGHT` on an equation draws a filled amber band. Over a one-line equation it looks like a
redaction bar rather than emphasis (visible on "18 > 14"). Alpha was reduced to 0.12, and the
triangle plan was switched to `PULSE`, but the underlying builder is still crude.

**Fix:** in `highlightStrokes`, use a marker-pen look — a band that covers only the text's x-height,
with a soft leading/trailing taper, rather than the full bounding box.

### D3. `resolveCollisions` is O(passes × n²) per insertion 🟡

Fine at ~30 nodes. A 60-beat lesson with 200 nodes will get sluggish because it runs on every
insertion and again after every `move`.

**Fix:** spatial hash or a simple grid bucket keyed on node bounds.

### D4. Lint warnings about store mutation during render 🟢

10 oxlint warnings in `BoardCanvas.tsx` and `useLesson.ts`. The `BoardCanvas` ones are false
positives for the external-store pattern (the store is deliberately the authority, not React state).
Two in `useLesson.ts` are genuine:

- `useMemo(() => Math.random() ...)` for `sessionId` — should be `useState(() => ...)`.
- `voiceRef.current` lazy-init read during render — should be `useState(() => new VoiceController(...))`.

*(This fix was identified but deliberately not applied, per the instruction to stop.)*

### D5. `WRITE_FRACTION` renders numerator/denominator but is never used 🟢

The builder exists and works; no plan or prompt exercises it. `A = 1/2 b h` is written inline as text
instead. Either use it in the triangle plan or drop it from the executable set so the registry's
`implemented` flag stays honest.

---

## 4. NEXT BUILD — priority order

### N1. Verify the live Z.AI path 🔴 CRITICAL — do this first

Nothing else matters if the live model path does not work. Everything downstream of it is tested;
this specific link is not.

**Steps:**
1. Put a real key in `.env` (`ZAI_API_KEY`) or the config panel.
2. Run each of the three demo questions on the live provider, plus two off-script ones
   (`"Explain how a binary search tree works"`, `"Explain photosynthesis"`).
3. Watch the execution log (the `log` toggle in the status strip) for `REJECT_*` reasons.

**What will probably break, in likelihood order:**

| Likely failure | Where to look | Fix shape |
| --- | --- | --- |
| Director returns a beat with zero valid actions → whole plan rejected | `pipeline.ts` `direct()` | Add a **repair pass**: re-prompt the director for just the failed beats, quoting the rejection reasons. Currently the whole lesson fails. |
| Model invents an id, then references a different one | `store.resolve()` | Already falls back to prefix and semanticRole matching; may need fuzzy matching or a post-pass that rewrites dangling references. |
| Model exceeds `max_tokens` on the director call (12k) and returns truncated JSON | `extractJson` throws `INVALID_RESPONSE` | Chunk the director call: one request per 3–4 beats instead of one for the whole lesson. **This is the single most valuable robustness change.** |
| `response_format: json_object` unsupported by the chosen model | `providers/index.ts` | Detect the 400 and retry without the flag. |
| Model picks a catalogued-but-not-executable capability (e.g. `CREATE_MOLECULE`) | `validate.ts` | Expected and handled — but for a chemistry question it means every action fails. See **N5**. |

**Definition of done:** all three scenarios complete on the live provider, and at least one off-script
question in a domain with executors (maths / CS) completes.

### N2. Verify ElevenLabs narration 🔴 CRITICAL

**Steps:** add `ELEVENLABS_API_KEY`, enable narration in the config panel, run a lesson.

**Known unknowns:**
- **Autoplay policy.** `voice.ts` already reports "Browser blocked audio playback", but submitting a
  question may not count as a sufficient user gesture in every browser. If it does block, create and
  unlock a silent `AudioContext` on the first click.
- **Pacing.** The presenter waits up to 12 s for a beat's narration after its visuals finish. If
  narration is consistently longer than the visuals, the lesson will feel like it stalls. Consider
  stretching action durations to fill the audio, or splitting long narration.
- **Cost.** Every beat is a separate TTS call. Add a per-lesson character budget.

**Definition of done:** a full lesson narrates without gaps, and pulling the key mid-lesson shows
`VOICE UNAVAILABLE` and continues silently.

### N3. Finish the browser acceptance suite 🟠 HIGH

The Chromium harness at `%TEMP%/nemo-shots/verify.mjs` works and got through binary search before the
run was stopped. **Move it into the repo** as `tests/browser/verify.mjs`, add `playwright` as a
devDependency, and add `npm run test:browser`.

It should assert:
- All three scenarios reach `Completed`.
- Ink fraction **strictly increases** over time (this is the machine-checkable proof of progressive
  drawing, which is the core product claim).
- Zero console errors, zero page errors, zero failed requests.
- Asking question B while A is running leaves B's question in the status strip and B's content on the
  board.
- No canvas content sits under the ask bar (this catches **D1** automatically).

### N4. Director repair loop 🟠 HIGH

Today a plan either validates or the lesson fails. That is the right *default*, but it makes the live
path brittle in exactly the way **N1** will expose.

**Build:** in `pipeline.ts`, after validation fails, re-prompt the Visual Director once with the
rejection reasons and only the beats that failed. Accept the repaired beats, re-validate, and fail
only if the second attempt also fails. Emit a `lesson.status` event so the repair is visible in the
log rather than hidden.

### N5. Domain coverage — more executors 🟠 HIGH

285 of 377 catalogued capabilities have no executor. A chemistry or biology question currently
produces a plan whose every action is refused. That is honest, but it is a bad demo.

Recommended order (highest teaching value per unit of work):

1. **Physics** — `CREATE_VECTOR` (alias exists, needs a proper origin/magnitude form),
   `DRAW_TRAJECTORY`, `SHOW_COMPONENTS`, `DECOMPOSE_VECTOR`, `CREATE_FORCE_DIAGRAM`.
   Mostly compositions of `arrowStrokes` — cheap.
2. **CS data structures** — `DRAW_TREE`, `DRAW_LINKED_LIST`, `DRAW_STACK`, `DRAW_QUEUE`,
   `DRAW_POINTER`. Same cell-and-anchor pattern as `buildArray`; reuse it.
3. **Chemistry** — `CREATE_ATOM`, `CREATE_BOND`, `CREATE_MOLECULE`, `CREATE_REACTION_ARROW`.
4. **Graphs** — `PLOT_POINTS`, `SHOW_TANGENT`, `SHADE_AREA`, `DRAW_NUMBER_LINE` (exists).

**Do not** flip `implemented: true` in `registry.ts` before the executor exists. The flag's honesty is
what makes the failure messages trustworthy.

Also add a **domain guard**: if the analyzer returns a domain with no executors, fail fast with a
clear message ("Nemo cannot draw chemistry yet") instead of generating a plan that will be refused
action by action.

### N6. Layout polish 🟡 MEDIUM

- Fix **D1** (chrome-aware camera insets) — highest visible impact.
- `ABOVE` placement collides with the text column when there is no headroom. Generalise the
  `reserveFlow` idea: any node that will be annotated above should reserve space. Currently only
  `DRAW_ARRAY` does.
- Multi-column boards. `flowX` is fixed at the board centre; a long lesson runs off the bottom. Wrap
  to a second column when the first exceeds a height budget (the code for this was removed when the
  flow was centred — see git history of `store.ts`).
- `MOVE_TO` re-runs collision resolution after the tween, which can visibly snap. Resolve first,
  then tween to the resolved position.

### N7. Production build path 🟡 MEDIUM

`npm run build` produces a client bundle but the API only exists as Vite middleware, so the built app
has no backend. Either:

- **(a)** Serve the built `dist/` from `server/standalone.ts` and document `npm run build && npm run api`; or
- **(b)** Keep dev-only and say so loudly in the README.

Pick (a) if this is ever demoed off a laptop. Note `server/standalone.ts` already exists and works;
it just needs static-file serving added.

### N8. P1 features from the original spec 🟢 LOW

Deliberately not built. In rough value order:

- **Follow-up questions.** Today a new question clears the board. Keeping context ("now show me the
  worst case") would be the most impressive addition.
- **Image upload + annotation.** The registry catalogs `CREATE_IMAGE`, `IMAGE_REGION`,
  `ARROW_TO_REGION`, `CIRCLE_REGION`, `LABEL_REGION`; none has an executor.
- **Pointer/stylus input** so the learner can draw on the board.
- **Scene persistence** (export/import the scene store as JSON — trivial, it is already serialisable).
- **Richer handwriting.** The font is recognisable but uniform; per-glyph slant variation and
  ligature-ish joins would sell "teacher" harder.

---

## 5. Architecture notes for whoever continues

### The invariant that must not be broken

> The model chooses **what**. Application code owns **how**, **where**, and **when**.

Every shortcut that violates this — letting the model pass a coordinate "just this once", adding an
`eval` for a plotted expression, accepting an unlisted action type — collapses the safety,
determinism and debuggability the whole design buys. `tests/nemo.test.ts` has a `security posture`
suite that fails the build if `eval`, `new Function`, `speechSynthesis` or a literal API key appears
anywhere in `src/`, `server/` or `shared/`. Keep it.

### Everything is ink

Text, equations, circles, arrays and arrows all reduce to `InkStroke` polylines. That is why
progressive drawing, the pen and the anti-overlap engine each exist once rather than per shape. When
adding a capability, produce strokes — do not add a new render path.

### Node ids follow a create-vs-reference rule

`action.target` names a **new** node when nothing by that name exists, and refers to an **existing**
node otherwise. So `DRAW_ARRAY target="array"` claims the name, while `HIGHLIGHT target="array"`
emphasises it and its band gets a derived id. This is in `makeNode` in `execute.ts`. Derived ids are
generated by probing, never a global counter — a global counter breaks replay determinism, which was
a real bug found and fixed in session 1.

### Attachment is transitive, but siblings still separate

A right-angle mark attached to a height line attached to a triangle overlaps all three deliberately —
`areAttached` walks the chain. But two pointers attached to the *same* array are siblings and **must**
still be pushed apart. Getting this wrong made the second `low`/`high` markers render on top of each
other; that was also found and fixed in session 1. Do not widen `areAttached` to shared roots.

### Determinism is a tested contract

Ink is seeded from `lessonId + nodeId + strokeIndex`. Two tests assert identical output across
replays. If you add randomness, seed it from the same chain.

---

## 6. Environment notes

- **Node 24.12** — the backend and tests run TypeScript natively (no build step). This requires
  `"type": "module"`, explicit `.ts` extensions on server/shared imports, and no non-erasable syntax
  (no enums, no parameter properties). `erasableSyntaxOnly` is on in `tsconfig.node.json` and will
  catch violations.
- **Python 3.14.5** with **Manim** and **Pillow** already installed on this machine.
- **Playwright + Chromium** installed globally via npx cache; not yet a project dependency.
- Dev server ports 5173–5175 were occupied; it ran on **5176**. Do not hardcode the port.

## 7. Fast re-verification after any change

```bash
npm test                    # 71 tests, must stay green
npm run typecheck           # must stay clean
node scripts/snapshot.ts binary   | python scripts/snapshot.py binary.png
node scripts/snapshot.ts equation | python scripts/snapshot.py equation.png
node scripts/snapshot.ts triangle | python scripts/snapshot.py triangle.png
```

Then eyeball the three PNGs. That loop catches essentially every layout and handwriting regression in
under ten seconds, and it is how the geometry bugs in session 1 were found.
