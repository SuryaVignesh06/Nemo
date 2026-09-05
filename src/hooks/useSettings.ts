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
  elevenlabs: { apiKey: '', voiceId: 'hpp4J3VqNfWAUOO0d1Us', modelId: 'eleven_flash_v2_5' },
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
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      zai: { ...DEFAULT_SETTINGS.zai, ...parsed.zai },
      openrouter: { ...DEFAULT_SETTINGS.openrouter, ...parsed.openrouter },
      gemini: { ...DEFAULT_SETTINGS.gemini, ...parsed.gemini },
      elevenlabs: { ...DEFAULT_SETTINGS.elevenlabs, ...parsed.elevenlabs },
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
      // Private browsing or a full quota: the session still works, the keys
      // just will not survive a reload.
    }
  }, [settings]);

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
