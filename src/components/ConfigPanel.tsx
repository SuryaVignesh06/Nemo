/**
 * NEMO — top-right configuration.
 *
 * Compact by default: a single pill showing provider, model and voice state.
 * Keys typed here go to localStorage and travel to the NEMO backend with each
 * request; they are never embedded in the bundle and never logged.
 */

/* oxlint-disable react/set-state-in-effect */
import { useEffect, useRef, useState } from 'react';
import {
  PROVIDER_LABELS,
  type ProviderName,
  type Settings,
  type ProviderSettings,
} from '../hooks/useSettings.ts';
import type { VoiceStatus } from '../presenter/voice.ts';

interface Props {
  settings: Settings;
  update(patch: Partial<Settings>): void;
  updateProvider(name: Exclude<ProviderName, 'mock'>, patch: Partial<ProviderSettings>): void;
  updateVoice(patch: Partial<Settings['elevenlabs']>): void;
  voiceStatus: VoiceStatus;
  voiceDetail: string;
  hasBrowserKey: boolean;
}

const PROVIDERS: ProviderName[] = ['zai', 'openrouter', 'gemini', 'mock'];

export function ConfigPanel({
  settings,
  update,
  updateProvider,
  updateVoice,
  voiceStatus,
  voiceDetail,
  hasBrowserKey,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const liveProvider =
    settings.provider === 'mock' ? null : (settings.provider as Exclude<ProviderName, 'mock'>);
  const isMock = liveProvider === null;
  const active = liveProvider ? settings[liveProvider] : null;

  useEffect(() => {
    if (!liveProvider) return;
    let cancel = false;
    setLoadingModels(true);
    fetch('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: liveProvider,
        apiKey: active?.apiKey,
      }),
    })
      .then((res) => res.json())
      .then((data: { models?: string[] }) => {
        if (!cancel && Array.isArray(data.models)) {
          setAvailableModels(data.models);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancel) setLoadingModels(false);
      });

    return () => {
      cancel = true;
    };
  }, [liveProvider, active?.apiKey]);

  const dot = isMock ? 'demo' : hasBrowserKey ? 'ok' : 'warn';

  return (
    <div className="config" ref={ref}>
      <button
        className="config__pill"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Provider, model and voice configuration"
      >
        <span className={`config__dot config__dot--${dot}`} aria-hidden />
        <span className="config__name">{PROVIDER_LABELS[settings.provider]}</span>
        <span className="config__model">{isMock ? 'scripted' : active!.model}</span>
        <span className={`config__voice config__voice--${voiceStatus}`}>
          {voiceStatus === 'unavailable'
            ? 'VOICE UNAVAILABLE'
            : settings.voiceEnabled
              ? 'ElevenLabs'
              : 'muted'}
        </span>
      </button>

      {open && (
        <div className="config__panel">
          <div className="config__row">
            <label className="config__label">Provider</label>
            <div className="config__tabs">
              {PROVIDERS.map((p) => (
                <button
                  key={p}
                  className={`config__tab ${settings.provider === p ? 'is-active' : ''}`}
                  onClick={() => update({ provider: p })}
                >
                  {PROVIDER_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {isMock ? (
            <p className="config__note">
              Demo Mode runs three scripted lessons offline — binary search, a linear equation, and
              the area of a triangle. It is never used as a fallback for a live provider that fails.
            </p>
          ) : (
            <>
              <div className="config__row">
                <label className="config__label" htmlFor="cfg-key">
                  API key
                </label>
                <input
                  id="cfg-key"
                  className="config__input"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={`${PROVIDER_LABELS[settings.provider]} API key`}
                  value={active!.apiKey}
                  onChange={(e) => updateProvider(liveProvider!, { apiKey: e.target.value })}
                />
              </div>

              <div className="config__row">
                <label className="config__label" htmlFor="cfg-model-select">
                  Select Model {loadingModels && '(loading...)'}
                </label>
                <select
                  id="cfg-model-select"
                  className="config__input config__select"
                  value={availableModels.includes(active!.model) ? active!.model : active!.model}
                  onChange={(e) => updateProvider(liveProvider!, { model: e.target.value })}
                >
                  {availableModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  {!availableModels.includes(active!.model) && (
                    <option value={active!.model}>{active!.model}</option>
                  )}
                </select>
              </div>

              <div className="config__row">
                <label className="config__label" htmlFor="cfg-model">
                  Model ID
                </label>
                <input
                  id="cfg-model"
                  className="config__input"
                  spellCheck={false}
                  value={active!.model}
                  onChange={(e) => updateProvider(liveProvider!, { model: e.target.value })}
                />
              </div>

              {settings.provider === 'zai' && (
                <div className="config__row">
                  <label className="config__label" htmlFor="cfg-base">
                    Base URL
                  </label>
                  <input
                    id="cfg-base"
                    className="config__input"
                    spellCheck={false}
                    placeholder="https://api.z.ai/api/paas/v4"
                    value={active!.baseUrl ?? ''}
                    onChange={(e) => updateProvider('zai', { baseUrl: e.target.value })}
                  />
                </div>
              )}
            </>
          )}

          <div className="config__divider" />

          <div className="config__row config__row--inline">
            <label className="config__label" htmlFor="cfg-voice-on">
              Narration
            </label>
            <input
              id="cfg-voice-on"
              type="checkbox"
              checked={settings.voiceEnabled}
              onChange={(e) => update({ voiceEnabled: e.target.checked })}
            />
            <span className="config__hint">ElevenLabs only — no browser speech synthesis.</span>
          </div>

          <div className="config__row">
            <label className="config__label" htmlFor="cfg-11-key">
              ElevenLabs key
            </label>
            <input
              id="cfg-11-key"
              className="config__input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="ElevenLabs API key"
              value={settings.elevenlabs.apiKey}
              onChange={(e) => updateVoice({ apiKey: e.target.value })}
            />
          </div>

          <div className="config__row">
            <label className="config__label" htmlFor="cfg-11-voice">
              Voice ID
            </label>
            <input
              id="cfg-11-voice"
              className="config__input"
              spellCheck={false}
              value={settings.elevenlabs.voiceId}
              onChange={(e) => updateVoice({ voiceId: e.target.value })}
            />
          </div>

          {voiceStatus === 'unavailable' && voiceDetail && (
            <p className="config__error">Voice unavailable: {voiceDetail}</p>
          )}

          <p className="config__note config__note--small">
            Keys are stored in this browser and sent to the local NEMO backend, which calls the
            provider. They are never bundled into the app and never logged. A key set in
            <code> .env </code> on the server is used when this field is blank.
          </p>
        </div>
      )}
    </div>
  );
}
