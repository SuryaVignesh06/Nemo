/**
 * NEMO — developer CLI.
 *
 * One entry point for the checks the build brief asks to be runnable without
 * manual debugging:
 *
 *   node scripts/nemo.ts health              provider + renderer diagnostics
 *   node scripts/nemo.ts demo <name>         run one acceptance scenario
 *   node scripts/nemo.ts demo all            run all four
 *   node scripts/nemo.ts graph               print the agent graph
 *
 * Demos run the real workflow against the configured provider. Pass
 * --provider=mock to exercise the deterministic path with no API key.
 */

import { randomUUID } from 'node:crypto';

import { LessonError } from '../shared/contracts.ts';
import { CAPABILITIES, EXECUTABLE_TYPES } from '../shared/registry.ts';
import { resolveProviderConfig, createProvider } from '../server/providers/index.ts';
import { ManimGLRenderer } from '../server/rendering/manimgl.ts';
import { runWorkflow } from '../server/workflow/run.ts';
import { buildLesson } from '../server/lesson/pipeline.ts';
import { resolveVoiceConfig, checkVoice } from '../server/voice/index.ts';

/* ------------------------------------------------------------ scenarios */

const DEMOS: Record<string, string> = {
  'binary-search': 'Explain binary search.',
  integral:
    'Evaluate the integral from 0 to 2 of x^2 and explain what it represents geometrically.',
  physics:
    'A 2 kg block is pulled along a rough horizontal surface by a 10 N force at 30 degrees above horizontal. The coefficient of kinetic friction is 0.2. Find the acceleration.',
  benzene: 'Explain benzene and why its pi electrons are delocalized.',
};

/* --------------------------------------------------------------- helpers */

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=').slice(1).join('=');
}

function line(label: string, value: unknown): void {
  console.log(`  ${label.padEnd(22)} ${String(value)}`);
}

/* ---------------------------------------------------------------- health */

async function health(): Promise<number> {
  console.log('\nNEMO health check\n' + '─'.repeat(40));

  const cfg = resolveProviderConfig({ provider: arg('provider') as never });
  console.log('\nprovider');
  line('configured', cfg.provider);
  line('model', cfg.model ?? '(default)');
  line('key present', Boolean(cfg.apiKey));

  let providerOk = false;
  if (cfg.provider === 'mock') {
    providerOk = true;
    line('reachable', 'n/a (mock)');
  } else if (!cfg.apiKey) {
    line('reachable', 'no key configured');
  } else {
    // A minimal request, never a lesson: this is a credential and connectivity
    // check, and a full lesson would cost seconds and tokens to learn nothing.
    const started = Date.now();
    try {
      const provider = createProvider(cfg);
      const reply = await provider.complete({
        system: 'Reply with the JSON object {"ok":true} and nothing else.',
        user: 'ping',
        json: true,
        maxTokens: 32,
        timeoutMs: 20_000,
      });
      providerOk = reply.trim().length > 0;
      line('reachable', `yes (${Date.now() - started}ms)`);
      line('structured output', /\{[\s\S]*\}/.test(reply) ? 'yes' : 'returned prose');
    } catch (err) {
      const e = err as LessonError;
      line('reachable', `NO — ${e.code ?? 'ERROR'}: ${e.message}`);
    }
  }

  console.log('\nrenderer');
  const rendererOk = await ManimGLRenderer.available();
  line('engine', 'manimgl (3b1b)');
  line('available', rendererOk ? 'yes' : 'NO — pip install manimgl');

  console.log('\nvoice');
  const voiceCfg = resolveVoiceConfig(undefined);
  line('provider', voiceCfg.provider);
  line('key present', Boolean(voiceCfg.apiKey));
  line('reachable', (await checkVoice(voiceCfg)) ? 'yes' : 'no (lessons run silently)');

  console.log('\nregistry');
  line('catalog', CAPABILITIES.length);
  line('executable', EXECUTABLE_TYPES.length);

  console.log('\nworkflow');
  line('engine', process.env.NEMO_WORKFLOW === 'legacy' ? 'legacy-pipeline' : 'langgraph');
  line('max repairs', process.env.VISUAL_REPAIR_MAX_ITERATIONS ?? '2');
  line(
    'vision critic',
    process.env.NEMO_VISION_CRITIC === '0' ? 'off (measurements only)' : 'on'
  );

  const ok = providerOk && rendererOk;
  console.log(`\n${ok ? 'OK' : 'DEGRADED'} — see above\n`);
  return ok ? 0 : 1;
}

/* ----------------------------------------------------------------- demos */

async function demo(name: string): Promise<number> {
  const names = name === 'all' ? Object.keys(DEMOS) : [name];
  let failures = 0;

  for (const key of names) {
    const question = DEMOS[key];
    if (!question) {
      console.error(`unknown demo "${key}". Try: ${Object.keys(DEMOS).join(', ')}, all`);
      return 1;
    }

    console.log(`\n${'═'.repeat(60)}\n${key}\n  ${question}\n${'═'.repeat(60)}`);

    const cfg = resolveProviderConfig({ provider: arg('provider') as never });
    const ids = { lessonId: randomUUID(), requestId: randomUUID() };
    const started = Date.now();

    try {
      if (cfg.provider === 'mock') {
        // The scripted path has no agents to run; exercise it directly.
        const r = await buildLesson(cfg, question, ids, {
          status: (stage, detail) => console.log(`  [${stage}] ${detail ?? ''}`),
        });
        report(key, r.plan, r.warnings, Date.now() - started);
      } else {
        const r = await runWorkflow({
          question,
          requestId: ids.requestId,
          sessionId: 'cli',
          lessonId: ids.lessonId,
          provider: cfg,
          status: (stage, detail) => console.log(`  [${stage}] ${detail ?? ''}`),
        });
        console.log(`\n  graph: ${r.visited.join(' -> ')}`);
        console.log(`  repairs: ${r.repairIterations}`);
        if (r.reviewScore !== null) console.log(`  critic score: ${r.reviewScore.toFixed(2)}`);
        console.log('');
        console.log(r.trace.format());
        report(key, r.plan, r.warnings, Date.now() - started);
      }
    } catch (err) {
      failures++;
      const e = err as LessonError;
      console.error(`\n  FAILED (${e.code ?? 'ERROR'}): ${e.message}`);
      if (e.details?.length) e.details.slice(0, 5).forEach((d) => console.error(`    - ${d}`));
    }
  }

  console.log(`\n${failures === 0 ? 'all demos produced a lesson' : `${failures} demo(s) failed`}\n`);
  return failures === 0 ? 0 : 1;
}

function report(
  key: string,
  plan: { beats: Array<{ visualActions: unknown[] }>; answer: string; domain: string },
  warnings: string[],
  ms: number
): void {
  const actions = plan.beats.reduce((n, b) => n + b.visualActions.length, 0);
  console.log(`\n  ${key}: ${plan.beats.length} beats, ${actions} actions in ${(ms / 1000).toFixed(1)}s`);
  console.log(`  domain: ${plan.domain}`);
  console.log(`  answer: ${plan.answer.slice(0, 120)}`);
  if (warnings.length) {
    console.log(`  warnings (${warnings.length}):`);
    warnings.slice(0, 5).forEach((w) => console.log(`    - ${w}`));
  }
}

/* ----------------------------------------------------------------- graph */

function printGraph(): number {
  console.log(`
NEMO agent graph

  START
    -> solver            "what is correct?"          AnswerArtifact
    -> director          "how should this be taught?" TeachingPlan
    -> planner           "what should be shown?"      VisualPlan
    -> composer          "how should it be composed?" SceneCompositionPlan
    -> compile           deterministic: registry + validation -> LessonPlan
    -> render            deterministic: ManimGL -> frames + measured geometry
    -> critic            "is the result good?"        VisualReview
         |
         +-- PASS / FATAL / budget exhausted --> finish --> END
         |
         +-- REPAIR_REQUIRED --> repair_pass ("what needs changing?")
                                     |
                                     +--> compile (never back through the agents)

  Repair budget: VISUAL_REPAIR_MAX_ITERATIONS (default 2).
  Deterministic measurements override a model PASS when geometry is broken.
`);
  return 0;
}

/* ------------------------------------------------------------------ main */

const command = process.argv[2] ?? 'health';
const code = await (command === 'health'
  ? health()
  : command === 'demo'
    ? demo(process.argv[3] ?? 'all')
    : command === 'graph'
      ? printGraph()
      : (console.error(`usage: node scripts/nemo.ts <health|demo|graph>`), 1));

process.exit(code);
