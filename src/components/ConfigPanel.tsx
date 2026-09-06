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
  /** Incremented by external navigation (for example Sidebar → Settings). */
  openRequest?: number;
}

const PROVIDERS: ProviderName[] = ['zai', 'openrouter', 'gemini', 'mock'];

interface VoiceOption {
  voice_id: string;
  name: string;
  category?: string;
}

interface ModelItem {
  id: string;
  name: string;
  provider: ProviderName;
  description?: string;
  isFree: boolean | null;
  pricingTier: 'free' | 'paid' | 'unknown';
  contextLength?: number;
  maxOutputTokens?: number;
  inputModalities: string[];
  outputModalities: string[];
  capabilities: string[];
  pricing?: {
    currency: 'USD';
    prompt?: number;
    completion?: number;
    request?: number;
  };
}

type ModelSort =
  | 'name-asc'
  | 'name-desc'
  | 'context-high-to-low'
  | 'context-low-to-high'
  | 'pricing-low-to-high'
  | 'pricing-high-to-low'
  | 'newest';

function tokenCount(value: number | undefined): string {
  return value === undefined ? 'Not published' : new Intl.NumberFormat().format(value);
}

function modelPricing(item: ModelItem): string {
  if (!item.pricing) return 'Not published by provider';
  const perMillion = (value: number | undefined) =>
    value === undefined ? '—' : `$${(value * 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
  return `${perMillion(item.pricing.prompt)} input / ${perMillion(item.pricing.completion)} output per 1M tokens`;
}

export function ConfigPanel({
  settings,
  update,
  updateProvider,
  updateVoice,
  voiceStatus,
  voiceDetail,
  hasBrowserKey,
  openRequest = 0,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openRequest > 0) setOpen(true);
  }, [openRequest]);

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
  const [modelItems, setModelItems] = useState<ModelItem[]>([]);
  const [modelFilter, setModelFilter] = useState<'all' | 'free' | 'paid'>('all');
  const [modelSearch, setModelSearch] = useState('');
  const [modelSort, setModelSort] = useState<ModelSort>('name-asc');
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  // ElevenLabs Voice Discovery & Testing
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [testingVoice, setTestingVoice] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);

  const liveProvider =
    settings.provider === 'mock' ? null : (settings.provider as Exclude<ProviderName, 'mock'>);
  const isMock = liveProvider === null;
  const active = liveProvider ? settings[liveProvider] : null;

  useEffect(() => {
    if (!liveProvider || !open) return;
    let cancel = false;
    setLoadingModels(true);
    setModelError(null);
    const timer = window.setTimeout(() => {
      fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: liveProvider,
          apiKey: active?.apiKey,
          filter: modelFilter,
          search: modelSearch,
          sort: modelSort,
        }),
      })
        .then(async (res) => {
          const data = (await res.json()) as {
            models?: string[];
            items?: ModelItem[];
            error?: { message?: string };
          };
          if (!res.ok) throw new Error(data.error?.message ?? `Model discovery failed (HTTP ${res.status}).`);
          return data;
        })
        .then((data) => {
          if (!cancel) {
            setAvailableModels(Array.isArray(data.models) ? data.models : []);
            setModelItems(Array.isArray(data.items) ? data.items : []);
          }
        })
        .catch((err: Error) => {
          if (!cancel) {
            setAvailableModels([]);
            setModelItems([]);
            setModelError(err.message);
          }
        })
        .finally(() => {
          if (!cancel) setLoadingModels(false);
        });
    }, 180);

    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [open, liveProvider, active?.apiKey, modelFilter, modelSearch, modelSort]);

  // Fetch ElevenLabs voices when config panel opens or key changes
  useEffect(() => {
    if (!open) return;
    fetch('/api/voice/voices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: settings.elevenlabs.apiKey }),
    })
      .then((res) => res.json())
      .then((data: { ok?: boolean; voices?: VoiceOption[] }) => {
        if (Array.isArray(data.voices) && data.voices.length > 0) {
          setVoices(data.voices);
        }
      })
      .catch(() => {});
  }, [open, settings.elevenlabs.apiKey]);

  const handleTestVoice = async () => {
    setTestingVoice(true);
    setVoiceFeedback(null);
    try {
      const res = await fetch('/api/voice/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice: {
            provider: 'elevenlabs',
            apiKey: settings.elevenlabs.apiKey,
            voiceId: settings.elevenlabs.voiceId,
            modelId: settings.elevenlabs.modelId,
          },
        }),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { error?: { message?: string } };
          if (body.error?.message) msg = body.error.message;
        } catch {}
        setVoiceFeedback(`❌ Voice test failed: ${msg}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      await audio.play();
      setVoiceFeedback('✅ ElevenLabs voice connected and playing!');
    } catch (err) {
      setVoiceFeedback(`❌ Error: ${(err as Error).message}`);
    } finally {
      setTestingVoice(false);
    }
  };

  const dot = isMock ? 'demo' : hasBrowserKey ? 'ok' : 'warn';
  const selectedModel = modelItems.find((item) => item.id === active?.model);

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
              Demo Mode runs complete scripted lessons offline, including binary search,
              equations, geometry, physics, chemistry, calculus, and an ESP32 LED circuit. It is
              never used as a fallback for a live provider that fails.
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

              {/* Model Filters (All / Free / Paid) */}
              <div className="config__row">
                <div className="config__filter-bar">
                  <label className="config__label">Model Filter</label>
                  <div className="config__filter-tabs">
                    <button
                      type="button"
                      className={`config__filter-btn ${modelFilter === 'all' ? 'is-active' : ''}`}
                      onClick={() => setModelFilter('all')}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={`config__filter-btn ${modelFilter === 'free' ? 'is-active' : ''}`}
                      onClick={() => setModelFilter('free')}
                    >
                      Free Only
                    </button>
                    <button
                      type="button"
                      className={`config__filter-btn ${modelFilter === 'paid' ? 'is-active' : ''}`}
                      onClick={() => setModelFilter('paid')}
                    >
                      Paid / Top
                    </button>
                  </div>
                </div>

                <label className="config__label" htmlFor="cfg-model-search">
                  Search discovered models
                </label>
                <input
                  id="cfg-model-search"
                  className="config__input"
                  type="search"
                  value={modelSearch}
                  placeholder="Name, model ID, or description"
                  onChange={(e) => setModelSearch(e.target.value)}
                />

                <label className="config__label" htmlFor="cfg-model-sort" style={{ marginTop: 8 }}>
                  Sort
                </label>
                <select
                  id="cfg-model-sort"
                  className="config__input config__select"
                  value={modelSort}
                  onChange={(e) => setModelSort(e.target.value as ModelSort)}
                >
                  <option value="name-asc">Name A–Z</option>
                  <option value="name-desc">Name Z–A</option>
                  <option value="context-high-to-low">Largest context</option>
                  <option value="context-low-to-high">Smallest context</option>
                  <option value="pricing-low-to-high">Lowest published price</option>
                  <option value="pricing-high-to-low">Highest published price</option>
                  <option value="newest">Newest</option>
                </select>

                <label className="config__label" htmlFor="cfg-model-select" style={{ marginTop: 8 }}>
                  Select Model {loadingModels && '(loading...)'}
                </label>
                <select
                  id="cfg-model-select"
                  className="config__input config__select"
                  value={availableModels.includes(active!.model) ? active!.model : active!.model}
                  onChange={(e) => updateProvider(liveProvider!, { model: e.target.value })}
                >
                  {availableModels.map((m) => {
                    const item = modelItems.find((it) => it.id === m);
                    const tag = item ? (item.isFree ? ' [Free]' : '') : '';
                    return (
                      <option key={m} value={m}>
                        {m}{tag}
                      </option>
                    );
                  })}
                  {!availableModels.includes(active!.model) && (
                    <option value={active!.model}>{active!.model}</option>
                  )}
                </select>

                {modelError && <p className="config__error">Model discovery: {modelError}</p>}
                {!modelError && !loadingModels && availableModels.length === 0 && (
                  <p className="config__note config__note--small">
                    No provider-published models match these filters. You can still enter a
                    documented model ID below.
                  </p>
                )}

                {selectedModel && (
                  <dl className="config__model-details">
                    <div>
                      <dt>Name</dt>
                      <dd>{selectedModel.name}</dd>
                    </div>
                    <div>
                      <dt>Price</dt>
                      <dd>
                        {selectedModel.pricingTier === 'unknown'
                          ? 'Unknown'
                          : selectedModel.pricingTier}{' '}
                        · {modelPricing(selectedModel)}
                      </dd>
                    </div>
                    <div>
                      <dt>Context</dt>
                      <dd>{tokenCount(selectedModel.contextLength)} tokens</dd>
                    </div>
                    <div>
                      <dt>Modalities</dt>
                      <dd>
                        {(selectedModel.inputModalities.length
                          ? selectedModel.inputModalities.join(', ')
                          : 'Not published')}{' '}
                        →{' '}
                        {selectedModel.outputModalities.length
                          ? selectedModel.outputModalities.join(', ')
                          : 'Not published'}
                      </dd>
                    </div>
                    {selectedModel.capabilities.length > 0 && (
                      <div>
                        <dt>Capabilities</dt>
                        <dd>{selectedModel.capabilities.join(', ')}</dd>
                      </div>
                    )}
                  </dl>
                )}
              </div>

              <div className="config__row">
                <label className="config__label" htmlFor="cfg-model">
                  Custom Model ID
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

          {/* ElevenLabs Configuration */}
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
            <span className="config__hint">ElevenLabs Voice AI (Fast Streaming)</span>
          </div>

          <div className="config__row">
            <label className="config__label" htmlFor="cfg-11-key">
              ElevenLabs API Key
            </label>
            <input
              id="cfg-11-key"
              className="config__input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="xi-api-key or from .env"
              value={settings.elevenlabs.apiKey}
              onChange={(e) => updateVoice({ apiKey: e.target.value })}
            />
          </div>

          <div className="config__row">
            <label className="config__label" htmlFor="cfg-11-voice">
              Voice ({voices.length > 0 ? `${voices.length} account voices found` : 'Default: Rachel'})
            </label>
            {voices.length > 0 ? (
              <select
                id="cfg-11-voice"
                className="config__input config__select"
                value={settings.elevenlabs.voiceId}
                onChange={(e) => updateVoice({ voiceId: e.target.value })}
              >
                {voices.map((v) => (
                  <option key={v.voice_id} value={v.voice_id}>
                    {v.name} ({v.category ?? 'voice'})
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="cfg-11-voice"
                className="config__input"
                spellCheck={false}
                placeholder="21m00Tcm4TlvDq8ikWAM (Rachel)"
                value={settings.elevenlabs.voiceId}
                onChange={(e) => updateVoice({ voiceId: e.target.value })}
              />
            )}
          </div>

          <div className="config__row">
            <button
              type="button"
              className="config__test-voice-btn"
              onClick={handleTestVoice}
              disabled={testingVoice}
            >
              {testingVoice ? '🔊 Testing Voice...' : '▶ Test ElevenLabs Voice'}
            </button>
            {voiceFeedback && (
              <p className={`config__voice-feedback ${voiceFeedback.startsWith('✅') ? 'is-ok' : 'is-err'}`}>
                {voiceFeedback}
              </p>
            )}
          </div>

          {voiceStatus === 'unavailable' && voiceDetail && (
            <p className="config__error">Voice status: {voiceDetail}</p>
          )}

          <p className="config__note config__note--small">
            Keys are stored in your browser session and sent to the local backend.
            If an API key is in <code>.env</code>, it will be automatically used.
          </p>
        </div>
      )}
    </div>
  );
}
