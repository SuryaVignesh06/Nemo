/**
 * NEMO — runtime configuration.
 *
 * Keys are entered in the config panel and kept in this browser's
 * localStorage, then sent per-request to the NEMO backend, which is what talks
 * to Z.AI and ElevenLabs. Nothing is baked into the bundle and no key is ever
 * sent anywhere except this app's own backend.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

export type ProviderName = 'zai' | 'openrouter' | 'gemini' | 'mock';

export interface ProviderSettings {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface Settings {
  provider: ProviderName;
  zai: ProviderSettings;
  openrouter: ProviderSettings;
  gemini: ProviderSettings;
  voiceEnabled: boolean;
  elevenlabs: { apiKey: string; voiceId: string; modelId: string };
}

const STORAGE_KEY = 'nemo.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  provider: 'zai',
  zai: { apiKey: '', model: 'glm-4.6', baseUrl: '' },
  openrouter: { apiKey: '', model: 'openai/gpt-4o-mini' },
  gemini: { apiKey: '', model: 'gemini-2.5-flash' },
  voiceEnabled: true,
  elevenlabs: { apiKey: '', voiceId: '21m00Tcm4TlvDq8ikWAM', modelId: 'eleven_flash_v2_5' },
};

export const PROVIDER_LABELS: Record<ProviderName, string> = {
  zai: 'Z.AI',
  openrouter: 'OpenRouter',
  gemini: 'Gemini',
  mock: 'Demo Mode',
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const loadedVoiceId = parsed.elevenlabs?.voiceId;
    const voiceId =
      !loadedVoiceId || loadedVoiceId === 'hpp4J3VqNfWAUOO0d1Us'
        ? '21m00Tcm4TlvDq8ikWAM'
        : loadedVoiceId;

    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      zai: { ...DEFAULT_SETTINGS.zai, ...parsed.zai },
      openrouter: { ...DEFAULT_SETTINGS.openrouter, ...parsed.openrouter },
      gemini: { ...DEFAULT_SETTINGS.gemini, ...parsed.gemini },
      elevenlabs: {
        ...DEFAULT_SETTINGS.elevenlabs,
        ...parsed.elevenlabs,
        voiceId,
      },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Private browsing or a full quota
    }
  }, [settings]);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((health: {
        providers?: { openrouter?: boolean; zai?: boolean; gemini?: boolean };
        defaultProvider?: ProviderName;
        defaultModel?: string;
      }) => {
        if (!health?.providers) return;
        setSettings((prev) => {
          let next = prev;

          // The browser starts on Z.AI; adopt whichever provider the server
          // actually holds a key for rather than blocking on a key nobody set.
          if (
            next.provider === 'zai' &&
            !next.zai.apiKey &&
            health.providers?.openrouter &&
            !health.providers?.zai
          ) {
            next = { ...next, provider: 'openrouter' };
          }

          /*
           * Adopt the server's configured model — but never a model the user
           * chose themselves. Only the untouched built-in default is replaced,
           * so .env decides for a fresh browser and the config panel still wins
           * once someone has picked something.
           */
          const target = health.defaultProvider ?? next.provider;
          if (
            health.defaultModel &&
            target !== 'mock' &&
            next[target as Exclude<ProviderName, 'mock'>] &&
            next[target as Exclude<ProviderName, 'mock'>].model ===
              DEFAULT_SETTINGS[target as Exclude<ProviderName, 'mock'>].model
          ) {
            const key = target as Exclude<ProviderName, 'mock'>;
            next = { ...next, [key]: { ...next[key], model: health.defaultModel } };
          }

          return next;
        });
      })
      .catch(() => {});
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateProvider = useCallback(
    (name: Exclude<ProviderName, 'mock'>, patch: Partial<ProviderSettings>) => {
      setSettings((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }));
    },
    []
  );

  const updateVoice = useCallback((patch: Partial<Settings['elevenlabs']>) => {
    setSettings((prev) => ({ ...prev, elevenlabs: { ...prev.elevenlabs, ...patch } }));
  }, []);

  /** The provider block sent to the backend with each lesson request. */
  const providerPayload = useMemo(() => {
    if (settings.provider === 'mock') return { provider: 'mock' as const };
    const p = settings[settings.provider];
    return {
      provider: settings.provider,
      apiKey: p.apiKey,
      model: p.model,
      ...(settings.provider === 'zai' && p.baseUrl ? { baseUrl: p.baseUrl } : {}),
    };
  }, [settings]);

  const activeModel =
    settings.provider === 'mock' ? 'deterministic' : settings[settings.provider].model;

  /**
   * Whether a lesson can be requested. A missing key is not fatal — the backend
   * can still have one in .env — so this only reports what the browser knows.
   */
  const hasBrowserKey =
    settings.provider === 'mock' || Boolean(settings[settings.provider].apiKey.trim());

  return {
    settings,
    update,
    updateProvider,
    updateVoice,
    providerPayload,
    activeModel,
    hasBrowserKey,
  };
}
