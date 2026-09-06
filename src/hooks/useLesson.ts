/**
 * NEMO — lesson orchestration in the browser.
 *
 * Consumes the backend's SSE stream, then hands the validated plan to the
 * Presenter, which draws it live against the scene store.
 *
 * Stale-request protection runs on both sides: the backend aborts a superseded
 * pipeline, and this hook ignores any event whose requestId is not the newest
 * one, so a slow answer to question A can never overwrite question B.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LessonEvent, LessonPlan } from '../../shared/contracts.ts';
import { SceneStore, type ViewportInsets } from '../scene/store.ts';
import { Presenter, type ActionRecord, type PresenterProgress } from '../presenter/presenter.ts';
import { VoiceController, type VoiceStatus } from '../presenter/voice.ts';
import type { Settings } from './useSettings.ts';

export type LessonStage =
  | 'IDLE'
  | 'CONNECTING'
  | 'ANALYZING'
  | 'SOLVING'
  | 'PLANNING'
  | 'DIRECTING'
  // Stages emitted by the agent graph. Without these the label freezes on
  // whatever the last recognised stage was, and the app looks hung while it
  // is in fact still working.
  | 'DESIGNING_VISUALS'
  | 'COMPOSING'
  | 'RENDERING'
  | 'REVIEWING'
  | 'REPAIRING'
  | 'GRAPH'
  | 'WARNINGS'
  | 'READY'
  | 'VALIDATING'
  | 'DRAWING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

const STAGE_LABELS: Record<LessonStage, string> = {
  IDLE: '',
  CONNECTING: 'Connecting',
  ANALYZING: 'Reading the question',
  SOLVING: 'Working out the answer',
  PLANNING: 'Planning the lesson',
  DIRECTING: 'Choosing what to draw',
  DESIGNING_VISUALS: 'Choosing what to draw',
  COMPOSING: 'Composing the board',
  RENDERING: 'Rendering',
  REVIEWING: 'Checking the visualization',
  REPAIRING: 'Fixing the visualization',
  GRAPH: 'Working',
  WARNINGS: 'Working',
  READY: 'Ready',
  VALIDATING: 'Checking the visual plan',
  DRAWING: 'Drawing',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

export interface DefinitionItem {
  term: string;
  definition: string;
}

export interface LessonState {
  stage: LessonStage;
  stageLabel: string;
  detail: string;
  question: string;
  /** The written answer, streamed before any visual work. */
  answer: string;
  finalAnswer: string;
  definitions: DefinitionItem[];
  plan: LessonPlan | null;
  narration: string;
  /** Every line spoken so far, oldest first. The rail's Transcript tab. */
  transcript: string[];
  beatIndex: number;
  beatCount: number;
  actionIndex: number;
  actionCount: number;
  error: string | null;
  voiceStatus: VoiceStatus;
  voiceDetail: string;
  /** Newest first, capped: shown in the developer strip. */
  log: string[];
}

const INITIAL: LessonState = {
  stage: 'IDLE',
  stageLabel: '',
  detail: '',
  question: '',
  answer: '',
  finalAnswer: '',
  definitions: [],
  plan: null,
  narration: '',
  transcript: [],
  beatIndex: 0,
  beatCount: 0,
  actionIndex: 0,
  actionCount: 0,
  error: null,
  voiceStatus: 'disabled',
  voiceDetail: '',
  log: [],
};

/**
 * How long the stream may go completely silent before the client gives up.
 *
 * Generous, because a real lesson legitimately spends a long time in a single
 * model call. The point is not to be strict — it is that "forever" is never
 * the answer, and the user gets a diagnosis instead of a spinner.
 */
const SILENCE_TIMEOUT_MS = 120_000;

let requestCounter = 0;

function makeSessionId(): string {
  return `s-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function useLesson(
  settings: Settings,
  providerPayload: Record<string, unknown>,
  /**
   * Screen edges the board must keep clear, given whether a lesson is on
   * screen. The rail only exists once a question has been asked, so the idle
   * board gets the whole viewport.
   */
  insetsFor: (hasLesson: boolean) => ViewportInsets = () => ({
    top: 60,
    bottom: 60,
    left: 60,
    right: 60,
  })
) {
  const [state, setState] = useState<LessonState>(INITIAL);
  const store = useMemo(() => new SceneStore(), []);
  const [sessionId, setSessionId] = useState(makeSessionId);

  const abortRef = useRef<AbortController | null>(null);
  const presenterRef = useRef<Presenter | null>(null);
  const activeRequestRef = useRef<string>('');
  const manualCameraRef = useRef(false);

  const [voiceController] = useState(
    () =>
      new VoiceController(
        {
          enabled: settings.voiceEnabled,
          apiKey: settings.elevenlabs.apiKey,
          voiceId: settings.elevenlabs.voiceId,
          modelId: settings.elevenlabs.modelId,
        },
        {
          onStatus: (voiceStatus, voiceDetail) =>
            setState((s) => ({ ...s, voiceStatus, voiceDetail: voiceDetail ?? '' })),
        }
      )
  );
  const voiceRef = useRef(voiceController);
  useEffect(() => {
    voiceRef.current = voiceController;
  }, [voiceController]);

  useEffect(() => {
    voiceRef.current?.update({
      enabled: settings.voiceEnabled,
      apiKey: settings.elevenlabs.apiKey,
      voiceId: settings.elevenlabs.voiceId,
      modelId: settings.elevenlabs.modelId,
    });
  }, [settings.voiceEnabled, settings.elevenlabs]);

  useEffect(() => () => voiceRef.current?.dispose(), []);

  const log = useCallback((line: string) => {
    setState((s) => ({ ...s, log: [line, ...s.log].slice(0, 60) }));
  }, []);

  const viewport = useCallback(
    () => ({ width: window.innerWidth, height: window.innerHeight }),
    []
  );

  // Read at the moment of each camera move: a rail that appears part-way
  // through the lesson must be avoided by everything drawn after it.
  const insets = useCallback(() => insetsFor(true), [insetsFor]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    presenterRef.current?.cancel();
    voiceRef.current?.stop();
  }, []);

  /** Start a genuinely fresh conversation without reloading the application. */
  const reset = useCallback(() => {
    cancel();
    activeRequestRef.current = '';
    manualCameraRef.current = false;
    store.clear();
    voiceRef.current?.reset();
    const nextSessionId = makeSessionId();
    setSessionId(nextSessionId);
    setState(INITIAL);
    return nextSessionId;
  }, [cancel, store]);

  const ask = useCallback(
    async (question: string, sessionOverride?: string) => {
      const trimmed = question.trim();
      if (!trimmed) return;

      // Newest request wins.
      cancel();
      const requestId = `r${++requestCounter}-${Date.now()}`;
      activeRequestRef.current = requestId;
      manualCameraRef.current = false;

      // A fresh question starts a fresh board: never leave the previous
      // lesson's drawing behind for the new one to be confused with.
      store.clear();
      voiceRef.current?.reset();

      setState({
        ...INITIAL,
        stage: 'CONNECTING',
        stageLabel: STAGE_LABELS.CONNECTING,
        question: trimmed,
        voiceStatus: settings.voiceEnabled ? 'ready' : 'disabled',
      });

      const controller = new AbortController();
      abortRef.current = controller;

      /*
       * Watchdog.
       *
       * The stream had no timeout at all, so a backend that stalled — a model
       * retrying a slow free-tier endpoint, say — left the UI spinning with no
       * way out. Each event received resets the clock, so a lesson that is
       * genuinely progressing is never cut off; only silence trips it.
       */
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;
      const resetWatchdog = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, SILENCE_TIMEOUT_MS);
      };
      resetWatchdog();

      let res: Response;
      try {
        res = await fetch('/api/lesson', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: trimmed,
            sessionId: sessionOverride ?? sessionId,
            requestId,
            provider: providerPayload,
          }),
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setState((s) => ({
          ...s,
          stage: 'FAILED',
          stageLabel: STAGE_LABELS.FAILED,
          error: `Could not reach the NEMO backend: ${(err as Error).message}`,
        }));
        return;
      }

      if (!res.ok || !res.body) {
        let message = `The backend returned HTTP ${res.status}.`;
        try {
          const body = (await res.json()) as { error?: { message?: string } };
          if (body.error?.message) message = body.error.message;
        } catch {
          // Keep the status message.
        }
        setState((s) => ({ ...s, stage: 'FAILED', stageLabel: STAGE_LABELS.FAILED, error: message }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let plan: LessonPlan | null = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // Progress: the backend is alive, so restart the silence clock.
          resetWatchdog();
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            const line = part.split('\n').find((l) => l.startsWith('data: '));
            if (!line) continue;
            let event: LessonEvent;
            try {
              event = JSON.parse(line.slice(6)) as LessonEvent;
            } catch {
              continue;
            }
            // Stale guard: a late event from a superseded question is dropped.
            if (activeRequestRef.current !== requestId) return;

            switch (event.type) {
              case 'lesson.started':
                log(`lesson.started ${event.lessonId.slice(0, 8)}`);
                break;
              case 'lesson.answer': {
                log(`lesson.answer (${event.domain ?? 'general'})`);
                const rawDefs = Array.isArray((event as any).definitions) ? (event as any).definitions : [];
                setState((s) => ({
                  ...s,
                  answer: event.answer,
                  finalAnswer: event.finalAnswer,
                  definitions: rawDefs,
                }));
                break;
              }
              case 'lesson.status': {
                const stage = (event.stage as LessonStage) ?? 'PLANNING';
                log(`${event.stage}${event.detail ? `: ${event.detail}` : ''}`);
                setState((s) => ({
                  ...s,
                  stage: STAGE_LABELS[stage] ? stage : s.stage,
                  stageLabel: STAGE_LABELS[stage] ?? s.stageLabel,
                  detail: event.detail ?? '',
                }));
                break;
              }
              case 'lesson.plan':
                plan = event.plan;
                setState((s) => ({ ...s, plan: event.plan }));
                log(`plan received: ${event.plan.beats.length} beats`);
                break;
              case 'lesson.failed':
                setState((s) => ({
                  ...s,
                  stage: 'FAILED',
                  stageLabel: STAGE_LABELS.FAILED,
                  error: `${event.message}`,
                }));
                log(`FAILED ${event.code}: ${event.message}`);
                return;
              case 'lesson.cancelled':
                setState((s) => ({ ...s, stage: 'CANCELLED', stageLabel: STAGE_LABELS.CANCELLED }));
                return;
              default:
                break;
            }
          }
        }
      } catch (err) {
        if (activeRequestRef.current !== requestId) return;
        if (timedOut) {
          setState((s) => ({
            ...s,
            stage: 'FAILED',
            stageLabel: STAGE_LABELS.FAILED,
            error:
              `No response for ${SILENCE_TIMEOUT_MS / 1000}s. The model may be ` +
              'slow, rate-limited, or returning nothing. Free reasoning models ' +
              'often do — try a different model in the config panel.',
          }));
          return;
        }
        if (controller.signal.aborted) return;
        setState((s) => ({
          ...s,
          stage: 'FAILED',
          stageLabel: STAGE_LABELS.FAILED,
          error: `The lesson stream broke: ${(err as Error).message}`,
        }));
        return;
      } finally {
        clearTimeout(watchdog);
      }

      if (!plan) {
        if (activeRequestRef.current !== requestId) return;
        setState((s) =>
          s.stage === 'FAILED' || s.stage === 'CANCELLED'
            ? s
            : {
                ...s,
                stage: 'FAILED',
                stageLabel: STAGE_LABELS.FAILED,
                error: 'The backend finished without producing a lesson plan.',
              }
        );
        return;
      }

      if (activeRequestRef.current !== requestId) return;

      const presenter = new Presenter(
        store,
        voiceRef.current!,
        {
          onProgress: (p: PresenterProgress) =>
            setState((s) =>
              activeRequestRef.current !== requestId
                ? s
                : {
                    ...s,
                    stage: p.stage === 'DRAWING' ? 'DRAWING' : (p.stage as LessonStage),
                    stageLabel: STAGE_LABELS[p.stage as LessonStage] ?? s.stageLabel,
                    beatIndex: p.beatIndex,
                    beatCount: p.beatCount,
                    actionIndex: p.actionIndex,
                    actionCount: p.actionCount,
                    narration: p.narration || s.narration,
                    // One entry per spoken line: beats repeat their narration
                    // across their own actions, so only a change appends.
                    transcript:
                      p.narration && p.narration !== s.transcript[s.transcript.length - 1]
                        ? [...s.transcript, p.narration]
                        : s.transcript,
                  }
            ),
          onAction: (r: ActionRecord) => {
            if (r.status === 'FAILED') log(`ACTION FAILED ${r.type}: ${r.reason ?? ''}`);
            else if (r.status === 'COMPLETED')
              log(`${r.type} COMPLETED${r.reason ? ` — ${r.reason}` : ''}`);
          },
          onLayoutNote: (note) => log(`layout: ${note}`),
          onCompleted: (summary) =>
            setState((s) =>
              activeRequestRef.current !== requestId
                ? s
                : { ...s, stage: 'COMPLETED', stageLabel: STAGE_LABELS.COMPLETED, narration: summary }
            ),
          onFailed: (message) =>
            setState((s) =>
              activeRequestRef.current !== requestId
                ? s
                : { ...s, stage: 'FAILED', stageLabel: STAGE_LABELS.FAILED, error: message }
            ),
        },
        viewport,
        insets
      );
      presenterRef.current = presenter;
      await presenter.play(plan);
    },
    [cancel, insets, log, providerPayload, sessionId, settings.voiceEnabled, store, viewport]
  );

  const onManualCamera = useCallback(() => {
    manualCameraRef.current = true;
  }, []);

  const busy =
    state.stage !== 'IDLE' &&
    state.stage !== 'COMPLETED' &&
    state.stage !== 'FAILED' &&
    state.stage !== 'CANCELLED';

  return { state, store, ask, cancel, reset, busy, onManualCamera };
}
