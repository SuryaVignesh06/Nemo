/**
 * NEMO — ManimGL render service.
 *
 * Drives the real `manimgl` binary over a validated LessonPlan and returns what
 * the Visual Critic needs: measured geometry and captured frames.
 *
 *   LessonPlan -> plan.json -> manimgl -> NemoLesson.mp4 + bounds.json
 *                                             |
 *                                        ffmpeg frames -> base64 PNG
 *
 * Security note: nothing here interpolates model output into a command line.
 * The plan is written to a file as JSON data, and the compiler reads it as
 * data. The only arguments passed to the process are paths this module chose.
 *
 * Availability note: ManimGL needs an OpenGL context and FFmpeg. Where that is
 * missing the service reports a capture failure rather than throwing — the
 * critic then works from measurements alone, and the workflow still completes.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { LessonPlan } from '../../shared/contracts.ts';
import type { RenderService } from '../workflow/graph.ts';
import {
  measureRects,
  type MeasuredRect,
  type RenderEvidence,
  type SceneMeasurements,
} from './evidence.ts';

export interface ManimGLOptions {
  /** Path to the compiler scene file. */
  scenePath?: string;
  /** `manimgl` executable. */
  binary?: string;
  /** Frames handed to the critic. More frames cost vision tokens. */
  frameCount?: number;
  /** Whole-render budget. A render that outruns this is abandoned, not awaited. */
  timeoutMs?: number;
  /** Rendering quality flag; low keeps the repair loop fast. */
  quality?: '-l' | '-m' | '--hd';
}

const DEFAULTS = {
  scenePath: 'manim/nemo_compiler.py',
  binary: 'manimgl',
  frameCount: 4,
  timeoutMs: 240_000,
  quality: '-l' as const,
};

const EMPTY_MEASUREMENTS: SceneMeasurements = {
  nodeCount: 0,
  visibleCount: 0,
  viewport: { width: 0, height: 0 },
  overlaps: [],
  clipped: [],
  offScreen: [],
  tooSmall: [],
  fillRatio: 0,
  blank: true,
};

interface ExecResult {
  code: number | null;
  stderr: string;
}

function exec(
  command: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs: number; signal?: AbortSignal }
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: opts.env,
      // No shell: arguments are never re-parsed, so a path cannot become a command.
      shell: false,
    });

    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${command} exceeded ${Math.round(opts.timeoutMs / 1000)}s`));
    }, opts.timeoutMs);

    const onAbort = () => {
      child.kill('SIGKILL');
      reject(new Error(`${command} cancelled`));
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    // stderr is captured, not streamed: ManimGL writes a progress bar there.
    child.stderr?.on('data', (c) => {
      stderr += String(c);
      if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
    });
    child.stdout?.resume();

    child.on('error', (err) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      resolve({ code, stderr });
    });
  });
}

export class ManimGLRenderer implements RenderService {
  private opts: Required<ManimGLOptions>;

  constructor(options: ManimGLOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  /** Minimal check that the toolchain is present, for the health endpoint. */
  static async available(binary = DEFAULTS.binary): Promise<boolean> {
    try {
      const r = await exec(binary, ['--version'], { timeoutMs: 30_000 });
      return r.code === 0;
    } catch {
      return false;
    }
  }

  async render(plan: LessonPlan, signal?: AbortSignal): Promise<RenderEvidence> {
    const dir = await mkdtemp(join(tmpdir(), 'nemo-render-'));
    try {
      const planPath = join(dir, 'plan.json');
      const boundsPath = join(dir, 'bounds.json');
      await writeFile(planPath, JSON.stringify(plan), 'utf8');

      const result = await exec(
        this.opts.binary,
        [this.opts.scenePath, 'NemoLesson', '-w', this.opts.quality, '--video_dir', dir],
        {
          env: { ...process.env, NEMO_PLAN: planPath, NEMO_BOUNDS: boundsPath },
          timeoutMs: this.opts.timeoutMs,
          signal,
        }
      );

      if (result.code !== 0) {
        // A refused action is a real defect the critic should see, not a crash.
        return {
          measurements: EMPTY_MEASUREMENTS,
          frames: [],
          captureError: `manimgl exited ${result.code}: ${lastMeaningfulLine(result.stderr)}`,
        };
      }

      const measurements = await this.readMeasurements(boundsPath);
      const { frames, error } = await this.captureFrames(dir, signal);

      return { measurements, frames, ...(error ? { captureError: error } : {}) };
    } catch (err) {
      return {
        measurements: EMPTY_MEASUREMENTS,
        frames: [],
        captureError: (err as Error).message,
      };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Read the geometry the compiler measured from the real rendered mobjects. */
  private async readMeasurements(boundsPath: string): Promise<SceneMeasurements> {
    try {
      const raw = JSON.parse(await readFile(boundsPath, 'utf8')) as {
        viewport: { width: number; height: number };
        nodes: Array<{ id: string; x: number; y: number; w: number; h: number }>;
      };
      const rects: MeasuredRect[] = raw.nodes.map((n) => ({
        id: n.id,
        x: n.x,
        y: n.y,
        w: n.w,
        h: n.h,
      }));
      return measureRects(rects, raw.viewport);
    } catch {
      return EMPTY_MEASUREMENTS;
    }
  }

  /**
   * Pull evenly spaced frames out of the rendered video.
   *
   * Evenly spaced rather than final-frame-only: a lesson that is legible at the
   * end can still have been unreadable in the middle, and the critic is asked
   * to judge the explanation, not the last slide.
   */
  private async captureFrames(
    dir: string,
    signal?: AbortSignal
  ): Promise<{ frames: string[]; error?: string }> {
    try {
      const files = await readdir(dir);
      const video = files.find((f) => f.endsWith('.mp4'));
      if (!video) return { frames: [], error: 'no video was produced' };

      const pattern = join(dir, 'frame_%02d.png');
      const n = this.opts.frameCount;

      const r = await exec(
        'ffmpeg',
        [
          '-loglevel', 'error',
          '-i', join(dir, video),
          // Sample n frames spread across the clip, scaled down for the model.
          '-vf', `thumbnail,scale=960:-1`,
          '-frames:v', String(n),
          '-vsync', 'vfr',
          pattern,
        ],
        { timeoutMs: 90_000, signal }
      );
      if (r.code !== 0) return { frames: [], error: `ffmpeg exited ${r.code}` };

      const produced = (await readdir(dir)).filter((f) => f.startsWith('frame_')).sort();
      const frames: string[] = [];
      for (const f of produced.slice(0, n)) {
        frames.push((await readFile(join(dir, f))).toString('base64'));
      }
      return frames.length ? { frames } : { frames: [], error: 'no frames were extracted' };
    } catch (err) {
      return { frames: [], error: (err as Error).message };
    }
  }
}

function lastMeaningfulLine(stderr: string): string {
  const lines = stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    // ManimGL's progress bar is carriage-return spam, not diagnosis.
    .filter((l) => l && !l.includes('it/s') && !l.startsWith('|'));
  return lines[lines.length - 1] ?? 'no error output';
}
