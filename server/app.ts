/**
 * NEMO — backend HTTP surface.
 *
 * Mounted as Vite middleware in development (see vite.config.ts) so the demo is
 * a single `npm run dev`, and runnable standalone via server/standalone.ts.
 *
 * Routes:
 *   GET  /api/health        provider + voice readiness
 *   GET  /api/registry      the semantic capability catalog
 *   POST /api/lesson        SSE stream: status events, then the validated plan
 *   POST /api/solve         deterministic equation solver
 *   POST /api/voice         ElevenLabs narration audio
 *   POST /api/voice/voices  list available ElevenLabs voices
 *   POST /api/voice/test    test ElevenLabs voice generation
 *   POST /api/models        list available models with free/paid filters
 *   POST /api/provider/health validate provider discovery credentials/reachability
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

import { loadEnv } from './env.ts';
import { LessonError, type LessonEvent } from '../shared/contracts.ts';
import { CAPABILITIES, EXECUTABLE_TYPES } from '../shared/registry.ts';
import { looksLikeEquation } from '../shared/solver.ts';
import { buildLesson, solveOnly } from './lesson/pipeline.ts';
import { buildFastLesson } from './lesson/fastPipeline.ts';
import { runWorkflow } from './workflow/run.ts';
import { ManimGLRenderer } from './rendering/manimgl.ts';
import {
  createProvider,
  resolveProviderConfig,
  type ListModelsOptions,
  type ModelPriceFilter,
  type ModelSort,
  type ProviderConfig,
  type ProviderName,
} from './providers/index.ts';
import { checkVoice, fetchVoices, resolveVoiceConfig, synthesize } from './voice/index.ts';

loadEnv();

/**
 * Questions the scripted demo library covers.
 *
 * Deliberately narrower than mockPlans' own routing. That router treats any
 * mention of "force" or "chemistry" as a demo, which is right once Demo Mode
 * has been chosen but wrong here: on a live provider a question about
 * electrostatic force is a real question, not a request for the friction
 * lesson. These patterns name the demos rather than their subjects.
 */
const DEMO_PATTERNS: readonly RegExp[] = [
  /\bbinary\s*search\b/i,
  /\besp\s*-?32\b/i,
  /\bbenzene\b/i,
  /\bfriction\b/i,
  /\b(?:definite\s+)?integral\b/i,
  /\barea\s+under\b/i,
  /\btriangle\b/i,
];

/** True when the composer text should draw a scripted lesson instead of calling a model. */
export function isDemoQuestion(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  // A bare equation is scripted too — solved by the real solver, drawn instantly.
  if (looksLikeEquation(q)) return true;
  return DEMO_PATTERNS.some((re) => re.test(q));
}

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

    // Workflow selection:
    // 1. mock provider -> deterministic offline plan
    // 2. NEMO_WORKFLOW=langgraph -> multi-agent graph with critic and review
    // 3. default -> Ultra-Fast Single-Pass Pipeline (< 10s)
    let result: {
      plan: any;
      warnings: string[];
      providerName: string;
      model: string;
    };

    /*
     * Demo keywords are served from the scripted library first.
     *
     * Typing "binary search" into the composer should draw immediately: the
     * scripted lesson is deterministic, needs no API key and no model call, so
     * it is the same every time it is shown. If the router turns out not to
     * cover the question after all — "explain F = ma" reads like an equation
     * but has no scripted plan — the failure is swallowed and the live
     * pipeline runs as normal, so nothing is lost by trying.
     */
    let demoResult: typeof result | null = null;
    if (cfg.provider !== 'mock' && isDemoQuestion(question)) {
      try {
        const demo = await buildLesson(
          { provider: 'mock' },
          question,
          { lessonId, requestId },
          { status, signal: controller.signal }
        );
        stream.send({
          type: 'lesson.answer',
          lessonId,
          answer: demo.plan.answer,
          definitions: [],
          finalAnswer: demo.plan.finalSummary,
          domain: demo.plan.domain,
        });
        demoResult = demo;
      } catch {
        // Not one of the scripted scenarios: carry on to the model.
      }
    }

    if (demoResult) {
      result = demoResult;
    } else if (cfg.provider === 'mock') {
      result = await buildLesson(cfg, question, { lessonId, requestId }, {
        status,
        signal: controller.signal,
      });
      stream.send({
        type: 'lesson.answer',
        lessonId,
        answer: result.plan.answer,
        definitions: [],
        finalAnswer: result.plan.finalSummary,
        domain: result.plan.domain,
      });
    } else if (process.env.NEMO_WORKFLOW === 'langgraph') {
      const r = await runWorkflow({
        question,
        requestId,
        sessionId,
        lessonId,
        provider: cfg,
        signal: controller.signal,
        status,
        onAnswer: (a) =>
          stream.send({
            type: 'lesson.answer',
            lessonId,
            answer: a.explanation || a.approach,
            finalAnswer: a.finalAnswer,
            domain: a.domain,
          }),
        onPlan: (plan, revision) => {
          publishedPlan = true;
          stream.send({ type: 'lesson.plan', lessonId, plan, revision });
        },
      });
      stream.send({
        type: 'lesson.status',
        lessonId,
        stage: 'GRAPH',
        detail: `${r.visited.join(' -> ')} | repairs: ${r.repairIterations}${
          r.reviewScore === null ? '' : ` | score: ${r.reviewScore.toFixed(2)}`
        }`,
      });
      result = {
        plan: r.plan,
        warnings: r.warnings,
        providerName: cfg.provider,
        model: cfg.model ?? '',
      };
    } else {
      // Ultra-Fast Engine (<10s)
      const fastRes = await buildFastLesson(cfg, question, { lessonId, requestId }, {
        status,
        signal: controller.signal,
        onAnswer: (a) =>
          stream.send({
            type: 'lesson.answer',
            lessonId,
            answer: a.explanation,
            definitions: a.definitions,
            finalAnswer: a.finalAnswer,
          }),
      });
      result = {
        plan: fastRes.plan,
        warnings: fastRes.warnings,
        providerName: fastRes.providerName,
        model: fastRes.model,
      };
    }

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
        (n: number, b: any) => n + b.visualActions.length,
        0
      )} actions`,
    });

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

async function handleVoiceVoices(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req);
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : undefined;
  const voices = await fetchVoices(apiKey);
  sendJson(res, 200, { ok: true, voices });
}

async function handleVoiceTest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req);
  const cfg = resolveVoiceConfig((body.voice ?? {}) as Record<string, string>);
  const text = 'Hello! ElevenLabs voice synthesis is connected and working.';
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
  const voiceCheck = await checkVoice(voiceCfg);
  /*
   * The server's own choice of provider and model, so the browser can adopt it.
   *
   * Without this the browser kept shipping its built-in default model on every
   * request, which silently overrode OPENROUTER_MODEL in .env — the operator
   * configured one model and the app quietly used another.
   */
  const serverDefault = resolveProviderConfig(undefined);
  sendJson(res, 200, {
    ok: true,
    defaultProvider: serverDefault.provider,
    defaultModel: serverDefault.model ?? '',
    providers: {
      zai: Boolean(env.ZAI_API_KEY),
      openrouter: Boolean(env.OPENROUTER_API_KEY),
      gemini: Boolean(env.GEMINI_API_KEY),
      mock: true,
    },
    voice: {
      provider: voiceCfg.provider,
      configured: Boolean(voiceCfg.apiKey),
      reachable: voiceCheck.ok,
      message: voiceCheck.message,
    },
    capabilities: { catalog: CAPABILITIES.length, executable: EXECUTABLE_TYPES.length },
    renderer: {
      engine: 'manimgl',
      available: await ManimGLRenderer.available(),
    },
    workflow: {
      engine: process.env.NEMO_WORKFLOW === 'langgraph' ? 'langgraph' : 'fast-single-pass',
      fastMode: process.env.NEMO_WORKFLOW !== 'langgraph',
    },
  });
}

async function handleModels(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req);
  const provider = parseDiscoveryProvider(body.provider);
  const config = resolveProviderConfig(
    {
      provider,
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
      model: typeof body.model === 'string' ? body.model : undefined,
      baseUrl: provider === 'zai' && typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
    },
    { lockProvider: true }
  );
  const options = parseModelOptions(body);
  const items = await createProvider(config).listModels(options);
  sendJson(res, 200, { provider, models: items.map((item) => item.id), items });
}

const MODEL_FILTERS = new Set<ModelPriceFilter>(['all', 'free', 'paid']);
const MODEL_SORTS = new Set<ModelSort>([
  'name-asc',
  'name-desc',
  'context-high-to-low',
  'context-low-to-high',
  'pricing-low-to-high',
  'pricing-high-to-low',
  'newest',
]);

function parseDiscoveryProvider(value: unknown): ProviderName {
  const provider = typeof value === 'string' ? value : 'openrouter';
  if (provider === 'zai' || provider === 'openrouter' || provider === 'gemini' || provider === 'mock') {
    return provider;
  }
  throw new LessonError('UNSUPPORTED', `Unknown provider "${provider}".`);
}

function parseModelOptions(body: Record<string, unknown>): ListModelsOptions {
  const filter = typeof body.filter === 'string' ? body.filter : 'all';
  const sort = typeof body.sort === 'string' ? body.sort : 'name-asc';
  if (!MODEL_FILTERS.has(filter as ModelPriceFilter)) {
    throw new LessonError('UNSUPPORTED', `Unknown model filter "${filter}".`);
  }
  if (!MODEL_SORTS.has(sort as ModelSort)) {
    throw new LessonError('UNSUPPORTED', `Unknown model sort "${sort}".`);
  }
  const search = typeof body.search === 'string' ? body.search.trim() : '';
  if (search.length > 200) {
    throw new LessonError('UNSUPPORTED', 'Model search is limited to 200 characters.');
  }
  return {
    filter: filter as ModelPriceFilter,
    sort: sort as ModelSort,
    search,
    timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined,
  };
}

async function handleProviderHealth(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req);
  const provider = parseDiscoveryProvider(body.provider);
  const config = resolveProviderConfig(
    {
      provider,
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
      model: typeof body.model === 'string' ? body.model : undefined,
      baseUrl: provider === 'zai' && typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
    },
    { lockProvider: true }
  );
  const health = await createProvider(config).healthCheck({
    timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined,
  });
  sendJson(res, 200, health);
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
    if (req.method === 'POST' && path === '/api/voice/voices') {
      await handleVoiceVoices(req, res);
      return true;
    }
    if (req.method === 'POST' && path === '/api/voice/test') {
      await handleVoiceTest(req, res);
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
    if (req.method === 'POST' && path === '/api/provider/health') {
      await handleProviderHealth(req, res);
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
