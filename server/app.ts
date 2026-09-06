/**
 * NEMO — backend HTTP surface.
 *
 * Mounted as Vite middleware in development (see vite.config.ts) so the demo is
 * a single `npm run dev`, and runnable standalone via server/standalone.ts.
 *
 * Routes:
 *   GET  /api/health    provider + voice readiness
 *   GET  /api/registry  the semantic capability catalog
 *   POST /api/lesson    SSE stream: status events, then the validated plan
 *   POST /api/solve     deterministic equation solver
 *   POST /api/voice     ElevenLabs narration audio
 *
 * API keys arrive in the request body from the browser's config panel, or from
 * the process environment. They are never echoed back and never logged.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

import { LessonError, type LessonEvent } from '../shared/contracts.ts';
import { CAPABILITIES, EXECUTABLE_TYPES } from '../shared/registry.ts';
import { buildLesson, solveOnly } from './lesson/pipeline.ts';
import { runWorkflow } from './workflow/run.ts';
import { ManimGLRenderer } from './rendering/manimgl.ts';
import { resolveProviderConfig, type ProviderConfig } from './providers/index.ts';
import { checkVoice, resolveVoiceConfig, synthesize } from './voice/index.ts';

/** Newest request wins: an in-flight lesson is aborted when another arrives. */
const inFlight = new Map<string, AbortController>();

async function readJson(req: IncomingMessage, limitBytes = 1_000_000): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    if (total > limitBytes) throw new LessonError('UNSUPPORTED', 'Request body too large.');
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new LessonError('INVALID_RESPONSE', 'Request body was not valid JSON.');
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendError(res: ServerResponse, err: unknown): void {
  if (err instanceof LessonError) {
    const status =
      err.code === 'MISSING_CREDENTIALS' ? 401 : err.code === 'RATE_LIMIT' ? 429 : 400;
    sendJson(res, status, { error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  // Never leak a stack trace to the client.
  console.error('[nemo] unexpected error:', err);
  sendJson(res, 500, {
    error: { code: 'UNAVAILABLE', message: 'The server hit an unexpected error.', details: [] },
  });
}

function providerFromBody(body: Record<string, unknown>): ProviderConfig {
  const raw = (body.provider ?? {}) as Partial<ProviderConfig>;
  return resolveProviderConfig(typeof raw === 'object' ? raw : undefined);
}

/* ------------------------------------------------------------------ SSE */

class EventStream {
  private closed = false;
  private res: ServerResponse;

  constructor(res: ServerResponse) {
    this.res = res;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    // Flush headers immediately so the client's reader starts.
    res.write(': nemo stream open\n\n');
  }

  send(event: LessonEvent | Record<string, unknown>): void {
    if (this.closed) return;
    this.res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.res.end();
  }
}

/* --------------------------------------------------------------- routes */

async function handleLesson(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req);
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : 'default';
  const requestId = typeof body.requestId === 'string' ? body.requestId : randomUUID();
  const lessonId = randomUUID();

  // Stale request protection: cancel whatever this session had running.
  inFlight.get(sessionId)?.abort();
  const controller = new AbortController();
  inFlight.set(sessionId, controller);

  const stream = new EventStream(res);
  // The graph publishes the plan mid-flight so drawing starts early; this
  // records it so the final send below does not replay the same lesson.
  let publishedPlan = false;
  req.on('close', () => {
    controller.abort();
    stream.close();
  });

  stream.send({ type: 'lesson.started', lessonId, requestId, question });

  try {
    if (!question) throw new LessonError('UNSUPPORTED', 'Ask a question first.');

    const cfg = providerFromBody(body);
    const status = (stage: string, detail?: string) =>
      stream.send({ type: 'lesson.status', lessonId, stage, detail });

    // The agent graph is the workflow. The original linear pipeline stays
    // reachable via NEMO_WORKFLOW=legacy (and for the mock provider, which
    // serves scripted plans and has no agents to run).
    const useLegacy = process.env.NEMO_WORKFLOW === 'legacy' || cfg.provider === 'mock';

    const result = useLegacy
      ? await buildLesson(cfg, question, { lessonId, requestId }, {
          status,
          signal: controller.signal,
        })
      : await (async () => {
          const r = await runWorkflow({
            question,
            requestId,
            sessionId,
            lessonId,
            provider: cfg,
            signal: controller.signal,
            status,
            // The written answer reaches the user first, like a chat reply.
            onAnswer: (a) =>
              stream.send({
                type: 'lesson.answer',
                lessonId,
                answer: a.explanation || a.approach,
                finalAnswer: a.finalAnswer,
                domain: a.domain,
              }),
            // The board starts drawing as soon as a plan is valid, rather than
            // waiting for an optional render-and-review pass.
            onPlan: (plan, revision) => {
              publishedPlan = true;
              stream.send({ type: 'lesson.plan', lessonId, plan, revision });
            },
          });
          // Surface the agent path so the developer strip can show it.
          stream.send({
            type: 'lesson.status',
            lessonId,
            stage: 'GRAPH',
            detail: `${r.visited.join(' -> ')} | repairs: ${r.repairIterations}${
              r.reviewScore === null ? '' : ` | score: ${r.reviewScore.toFixed(2)}`
            }`,
          });
          return {
            plan: r.plan,
            warnings: r.warnings,
            providerName: cfg.provider,
            model: cfg.model ?? '',
          };
        })();

    if (controller.signal.aborted) {
      stream.send({ type: 'lesson.cancelled', lessonId });
      stream.close();
      return;
    }

    stream.send({
      type: 'lesson.status',
      lessonId,
      stage: 'READY',
      detail: `${result.plan.beats.length} beats, ${result.plan.beats.reduce(
        (n, b) => n + b.visualActions.length,
        0
      )} actions`,
    });
    // Only send here if the graph did not already publish it mid-flight;
    // resending would restart the drawing the learner is already watching.
    if (!publishedPlan) {
      stream.send({ type: 'lesson.plan', lessonId, plan: result.plan });
    }
    if (result.warnings.length) {
      stream.send({ type: 'lesson.status', lessonId, stage: 'WARNINGS', detail: result.warnings.join(' | ') });
    }
  } catch (err) {
    const le =
      err instanceof LessonError
        ? err
        : new LessonError('UNAVAILABLE', (err as Error).message ?? 'Unknown failure');
    if (le.code === 'STALE_REQUEST') {
      stream.send({ type: 'lesson.cancelled', lessonId });
    } else {
      console.error(`[nemo] lesson failed (${le.code}):`, le.message);
      stream.send({
        type: 'lesson.failed',
        lessonId,
        code: le.code,
        message: le.details.length ? `${le.message} (${le.details[0]})` : le.message,
      });
    }
  } finally {
    if (inFlight.get(sessionId) === controller) inFlight.delete(sessionId);
    stream.close();
  }
}

async function handleSolve(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req);
  const question = typeof body.question === 'string' ? body.question : '';
  sendJson(res, 200, { solution: solveOnly(question) });
}

async function handleVoice(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req);
  const text = typeof body.text === 'string' ? body.text : '';
  const cfg = resolveVoiceConfig((body.voice ?? {}) as Record<string, string>);
  const { audio, contentType } = await synthesize(cfg, text);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': audio.byteLength,
    'Cache-Control': 'no-store',
  });
  res.end(audio);
}

async function handleHealth(res: ServerResponse): Promise<void> {
  const env = process.env;
  const voiceCfg = resolveVoiceConfig(undefined);
  const voiceReady = await checkVoice(voiceCfg);
  sendJson(res, 200, {
    ok: true,
    providers: {
      // Only whether a key is present, never the key itself.
      zai: Boolean(env.ZAI_API_KEY),
      openrouter: Boolean(env.OPENROUTER_API_KEY),
      gemini: Boolean(env.GEMINI_API_KEY),
      mock: true,
    },
    voice: { provider: voiceCfg.provider, configured: Boolean(voiceCfg.apiKey), reachable: voiceReady },
    capabilities: { catalog: CAPABILITIES.length, executable: EXECUTABLE_TYPES.length },
    renderer: {
      engine: 'manimgl',
      available: await ManimGLRenderer.available(),
    },
    workflow: {
      engine: env.NEMO_WORKFLOW === 'legacy' ? 'legacy-pipeline' : 'langgraph',
      maxRepairIterations: Number(env.VISUAL_REPAIR_MAX_ITERATIONS ?? 2),
      visionCritic: env.NEMO_VISION_CRITIC !== '0' && env.NEMO_VISION_CRITIC !== 'false',
    },
  });
}

async function handleModels(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req);
  const provider = typeof body.provider === 'string' ? body.provider : 'openrouter';
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';

  let models: string[] = [];

  if (provider === 'openrouter') {
    try {
      const headers: Record<string, string> = {};
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      const apiRes = await fetch('https://openrouter.ai/api/v1/models', { headers });
      if (apiRes.ok) {
        const json = (await apiRes.json()) as { data?: Array<{ id?: string }> };
        if (Array.isArray(json.data)) {
          models = json.data.map((m) => m.id).filter((id): id is string => Boolean(id));
        }
      }
    } catch {
      // Fallback
    }
    if (models.length === 0) {
      models = [
        'openai/gpt-4o-mini',
        'openai/gpt-4o',
        'anthropic/claude-3.5-sonnet',
        'google/gemini-2.0-flash-001',
        'meta-llama/llama-3.3-70b-instruct',
        'deepseek/deepseek-r1',
        'qwen/qwen-2.5-72b-instruct',
      ];
    }
  } else if (provider === 'zai') {
    models = ['glm-4.6', 'glm-4', 'glm-4-flash', 'glm-4-plus'];
  } else if (provider === 'gemini') {
    models = ['gemini-2.5-flash', 'gemini-2.0-flash-001', 'gemini-1.5-pro', 'gemini-1.5-flash'];
  }

  sendJson(res, 200, { models });
}

function handleRegistry(res: ServerResponse): void {
  sendJson(res, 200, {
    catalog: CAPABILITIES,
    executable: EXECUTABLE_TYPES,
  });
}

/* -------------------------------------------------------------- dispatch */

export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const url = req.url ?? '';
  if (!url.startsWith('/api/')) return false;
  const path = url.split('?')[0];

  try {
    if (req.method === 'POST' && path === '/api/lesson') {
      await handleLesson(req, res);
      return true;
    }
    if (req.method === 'POST' && path === '/api/solve') {
      await handleSolve(req, res);
      return true;
    }
    if (req.method === 'POST' && path === '/api/voice') {
      await handleVoice(req, res);
      return true;
    }
    if (req.method === 'POST' && path === '/api/models') {
      await handleModels(req, res);
      return true;
    }
    if (req.method === 'GET' && path === '/api/health') {
      await handleHealth(res);
      return true;
    }
    if (req.method === 'GET' && path === '/api/registry') {
      handleRegistry(res);
      return true;
    }
    sendJson(res, 404, { error: { code: 'UNSUPPORTED', message: `No route for ${req.method} ${path}` } });
    return true;
  } catch (err) {
    if (!res.headersSent) sendError(res, err);
    else res.end();
    return true;
  }
}
