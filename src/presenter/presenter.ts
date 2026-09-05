/**
 * NEMO — live presentation engine.
 *
 * The backend produces a validated plan; this drives it in real time. Actions
 * execute one at a time against the scene store, each with a real duration, so
 * the learner watches the board being built rather than seeing a finished
 * picture appear.
 *
 * Every action reaches a terminal state — COMPLETED, FAILED or CANCELLED — and
 * reports it. Nothing is dropped quietly.
 */

import type { ActionStatus, LessonPlan, VisualAction } from '../../shared/contracts.ts';
import { SceneStore, cameraForBounds, type Camera } from '../scene/store.ts';
import { applyAction, type ActionOutcome } from '../scene/execute.ts';
import { checkCollisions } from '../scene/store.ts';
import { smooth } from '../manim/easing.ts';
import type { VoiceController } from './voice.ts';

export interface PresenterProgress {
  stage: 'IDLE' | 'PLANNING' | 'DRAWING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  beatIndex: number;
  beatCount: number;
  actionIndex: number;
  actionCount: number;
  narration: string;
  note?: string;
}

export interface ActionRecord {
  actionId: string;
  beatId: string;
  type: string;
  status: ActionStatus;
  reason?: string;
}

export interface PresenterCallbacks {
  onProgress(p: PresenterProgress): void;
  onAction(record: ActionRecord): void;
  onLayoutNote(note: string): void;
  onCompleted(summary: string): void;
  onFailed(message: string): void;
}

const MIN_ACTION_MS = 180;

export class Presenter {
  private raf = 0;
  private cancelled = false;
  private running = false;

  private store: SceneStore;
  private voice: VoiceController;
  private cb: PresenterCallbacks;
  private viewport: () => { width: number; height: number };

  constructor(
    store: SceneStore,
    voice: VoiceController,
    cb: PresenterCallbacks,
    viewport: () => { width: number; height: number }
  ) {
    this.store = store;
    this.voice = voice;
    this.cb = cb;
    this.viewport = viewport;
  }

  get isRunning(): boolean {
    return this.running;
  }

  cancel(): void {
    this.cancelled = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.voice.stop();
  }

  async play(plan: LessonPlan): Promise<void> {
    this.cancelled = false;
    this.running = true;
    const totalActions = plan.beats.reduce((n, b) => n + b.visualActions.length, 0);
    let doneActions = 0;

    try {
      for (const [bi, beat] of plan.beats.entries()) {
        if (this.cancelled) break;

        this.cb.onProgress({
          stage: 'DRAWING',
          beatIndex: bi + 1,
          beatCount: plan.beats.length,
          actionIndex: doneActions,
          actionCount: totalActions,
          narration: beat.narration,
        });

        // Narration starts with the beat and runs alongside its visuals.
        const speaking = this.voice.speak(beat.narration);
        // Warm the next beat's audio while this one draws.
        const next = plan.beats[bi + 1];
        if (next) void this.voice.prefetch(next.narration);

        for (const action of beat.visualActions) {
          if (this.cancelled) break;
          doneActions++;
          this.cb.onAction({
            actionId: action.actionId,
            beatId: beat.beatId,
            type: action.type,
            status: 'RUNNING',
          });
          try {
            const outcome = applyAction(this.store, action, {
              lessonId: plan.lessonId,
              viewport: this.viewport(),
            });
            if (outcome.layout?.moved.length) {
              for (const m of outcome.layout.moved) this.cb.onLayoutNote(m.reason);
            }
            if (outcome.layout?.unresolved.length) {
              for (const u of outcome.layout.unresolved) this.cb.onLayoutNote(`UNRESOLVED: ${u}`);
            }
            await this.animate(outcome);
            this.cb.onAction({
              actionId: action.actionId,
              beatId: beat.beatId,
              type: action.type,
              status: this.cancelled ? 'CANCELLED' : 'COMPLETED',
              reason: outcome.note,
            });
          } catch (err) {
            // One bad action must not silently vanish or kill the lesson.
            this.cb.onAction({
              actionId: action.actionId,
              beatId: beat.beatId,
              type: action.type,
              status: 'FAILED',
              reason: (err as Error).message,
            });
          }
          this.cb.onProgress({
            stage: 'DRAWING',
            beatIndex: bi + 1,
            beatCount: plan.beats.length,
            actionIndex: doneActions,
            actionCount: totalActions,
            narration: beat.narration,
          });
        }

        // Let the narration finish before moving on, within reason.
        if (!this.cancelled) await this.raceTimeout(speaking, 12_000);
        if (!this.cancelled) await this.sleep(260);
      }

      if (this.cancelled) {
        this.cb.onProgress({
          stage: 'CANCELLED',
          beatIndex: 0,
          beatCount: plan.beats.length,
          actionIndex: doneActions,
          actionCount: totalActions,
          narration: '',
        });
        return;
      }

      // Final framing so the finished board is fully visible.
      const bounds = this.store.contentBounds();
      if (bounds) {
        await this.tweenCamera(cameraForBounds(bounds, this.viewport(), 100, 1.1), 1.0);
      }

      const collisions = checkCollisions(this.store);
      if (!collisions.pass) {
        for (const c of collisions.conflicts) this.cb.onLayoutNote(`COLLISION: ${c}`);
      }

      this.cb.onProgress({
        stage: 'COMPLETED',
        beatIndex: plan.beats.length,
        beatCount: plan.beats.length,
        actionIndex: totalActions,
        actionCount: totalActions,
        narration: '',
      });
      this.cb.onCompleted(plan.finalSummary);
    } catch (err) {
      this.cb.onFailed((err as Error).message);
    } finally {
      this.running = false;
      this.store.pen = null;
      this.store.penDown = false;
      this.store.touch();
    }
  }

  /* ------------------------------------------------------------ tweens */

  private async animate(outcome: ActionOutcome): Promise<void> {
    const ms = Math.max(MIN_ACTION_MS, outcome.duration * 1000);
    switch (outcome.kind) {
      case 'draw':
        return this.tweenDraw(outcome.nodeIds, ms);
      case 'fade':
        return this.tweenOpacity(outcome.nodeIds, outcome.opacity ?? 1, ms);
      case 'move':
        return this.tweenTransform(outcome.nodeIds, outcome.to ?? {}, ms);
      case 'scale':
      case 'rotate':
        return this.tweenTransform(outcome.nodeIds, outcome.to ?? {}, ms);
      case 'camera':
        return outcome.camera ? this.tweenCamera(outcome.camera, ms / 1000) : undefined;
      case 'emphasis':
        return this.tweenEmphasis(outcome.nodeIds, ms, outcome.emphasis ?? 'pulse');
      case 'dim':
        return this.sleep(ms);
      case 'wait':
        return this.sleep(ms);
      case 'instant':
      default:
        return;
    }
  }

  /** Progressive ink: drawProgress 0 -> 1, with the pen riding the frontier. */
  private tweenDraw(ids: string[], ms: number): Promise<void> {
    const nodes = ids.map((id) => this.store.get(id)).filter(Boolean);
    if (nodes.length === 0) return this.sleep(ms);
    for (const n of nodes) {
      n!.drawProgress = 0;
      n!.visible = true;
    }
    this.store.penDown = true;
    return this.tween(ms, (t) => {
      for (const n of nodes) n!.drawProgress = t;
      this.store.touch();
    }).then(() => {
      this.store.penDown = false;
      this.store.touch();
    });
  }

  private tweenOpacity(ids: string[], target: number, ms: number): Promise<void> {
    const nodes = ids.map((id) => this.store.get(id)).filter(Boolean);
    if (nodes.length === 0) return this.sleep(ms);
    const from = nodes.map((n) => n!.opacity);
    for (const n of nodes) {
      n!.visible = true;
      if (n!.drawProgress === 0) n!.drawProgress = 1;
    }
    return this.tween(ms, (t) => {
      nodes.forEach((n, i) => {
        n!.opacity = from[i] + (target - from[i]) * t;
      });
      this.store.touch();
    }).then(() => {
      for (const n of nodes) if (n!.opacity <= 0.01) n!.visible = false;
      this.store.touch();
    });
  }

  private tweenTransform(
    ids: string[],
    to: { x?: number; y?: number; scale?: number; rotation?: number },
    ms: number
  ): Promise<void> {
    const nodes = ids.map((id) => this.store.get(id)).filter(Boolean);
    if (nodes.length === 0) return this.sleep(ms);
    const from = nodes.map((n) => ({ ...n!.transform }));
    return this.tween(ms, (t) => {
      nodes.forEach((n, i) => {
        const f = from[i];
        if (to.x !== undefined) n!.transform.x = f.x + (to.x - f.x) * t;
        if (to.y !== undefined) n!.transform.y = f.y + (to.y - f.y) * t;
        if (to.scale !== undefined) n!.transform.scale = f.scale + (to.scale - f.scale) * t;
        if (to.rotation !== undefined)
          n!.transform.rotation = f.rotation + (to.rotation - f.rotation) * t;
      });
      this.store.touch();
    }).then(() => {
      // Placement changed, so re-run anti-overlap for the moved nodes.
      for (const n of nodes) this.store.resolveCollisions(n!.id);
      this.store.touch();
    });
  }

  private tweenEmphasis(
    ids: string[],
    ms: number,
    kind: 'pulse' | 'flash' | 'glow' | 'highlight'
  ): Promise<void> {
    const nodes = ids.map((id) => this.store.get(id)).filter(Boolean);
    if (nodes.length === 0) return this.sleep(ms);
    // A newly created highlight band still needs drawing in.
    const fresh = nodes.filter((n) => n!.drawProgress === 0);
    for (const n of fresh) n!.drawProgress = 1;
    const base = nodes.map((n) => n!.transform.scale);
    const amp = kind === 'flash' ? 0 : 0.06;
    return this.tween(ms, (t) => {
      const wave = Math.sin(t * Math.PI) * amp;
      nodes.forEach((n, i) => {
        n!.transform.scale = base[i] + wave;
        if (kind === 'flash') n!.opacity = 0.45 + 0.55 * Math.abs(Math.sin(t * Math.PI * 2));
      });
      this.store.touch();
    }).then(() => {
      nodes.forEach((n, i) => {
        n!.transform.scale = base[i];
        if (kind === 'flash') n!.opacity = 1;
      });
      this.store.touch();
    });
  }

  private tweenCamera(target: Camera, seconds: number): Promise<void> {
    const from = { ...this.store.camera };
    return this.tween(Math.max(MIN_ACTION_MS, seconds * 1000), (t) => {
      this.store.camera = {
        x: from.x + (target.x - from.x) * t,
        y: from.y + (target.y - from.y) * t,
        // Zoom interpolates geometrically so the motion feels even.
        zoom: from.zoom * Math.pow(target.zoom / from.zoom, t),
      };
      this.store.touch();
    });
  }

  private tween(ms: number, step: (t: number) => void): Promise<void> {
    return new Promise((resolve) => {
      const start = performance.now();
      const frame = (now: number) => {
        if (this.cancelled) {
          step(1);
          resolve();
          return;
        }
        const raw = Math.min(1, (now - start) / ms);
        step(smooth(raw));
        if (raw < 1) {
          this.raf = requestAnimationFrame(frame);
        } else {
          resolve();
        }
      };
      this.raf = requestAnimationFrame(frame);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const start = performance.now();
      const frame = (now: number) => {
        if (this.cancelled || now - start >= ms) resolve();
        else this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    });
  }

  private raceTimeout(p: Promise<void>, ms: number): Promise<void> {
    return Promise.race([p, this.sleep(ms)]);
  }
}

export type { VisualAction };
