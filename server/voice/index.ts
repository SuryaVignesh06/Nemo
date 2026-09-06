/**
 * NEMO — voice providers.
 *
 * ElevenLabs is the primary voice provider. If it is unavailable the UI shows
 * "VOICE UNAVAILABLE" and the lesson continues silently.
 */

import { LessonError } from '../../shared/contracts.ts';

export interface VoiceConfig {
  provider: 'elevenlabs' | 'none';
  apiKey?: string;
  voiceId?: string;
  modelId?: string;
}

export interface VoiceResult {
  audio: Buffer;
  contentType: string;
}

/** ElevenLabs canonical premade "Rachel" voice (present on all ElevenLabs accounts). */
export const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
export const DEFAULT_MODEL_ID = 'eleven_flash_v2_5';
export const FALLBACK_MODEL_ID = 'eleven_multilingual_v2';

export function resolveVoiceConfig(body: Partial<VoiceConfig> | undefined): VoiceConfig {
  const env = process.env;
  const apiKey = body?.apiKey?.trim() || env.ELEVENLABS_API_KEY;
  const provider = body?.provider ?? (apiKey ? 'elevenlabs' : 'none');
  let voiceId = body?.voiceId?.trim() || env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  // Migrate legacy non-functional ID if present
  if (voiceId === 'hpp4J3VqNfWAUOO0d1Us') {
    voiceId = DEFAULT_VOICE_ID;
  }
  return {
    provider,
    apiKey,
    voiceId,
    modelId: body?.modelId?.trim() || env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID,
  };
}

/** In-memory TTS audio cache for demo lines and repeated narrations. */
const ttsCache = new Map<string, VoiceResult>();

export async function synthesize(cfg: VoiceConfig, text: string): Promise<VoiceResult> {
  const clean = text.trim();
  if (!clean) throw new LessonError('UNSUPPORTED', 'Nothing to speak.');

  let voiceId = cfg.voiceId?.trim() || DEFAULT_VOICE_ID;
  if (voiceId === 'hpp4J3VqNfWAUOO0d1Us') voiceId = DEFAULT_VOICE_ID;

  const cacheKey = `${voiceId}:${clean}`;
  const cached = ttsCache.get(cacheKey);
  if (cached) return cached;

  const apiKey = (cfg.apiKey?.trim() || process.env.ELEVENLABS_API_KEY?.trim()) ?? '';
  if (!apiKey) {
    throw new LessonError(
      'MISSING_CREDENTIALS',
      'No ElevenLabs API key configured. Add one in the config panel or set ELEVENLABS_API_KEY in .env.'
    );
  }

  const callTts = async (vId: string, mId?: string): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      const voiceSettings: Record<string, unknown> = {
        stability: 0.5,
        similarity_boost: 0.75,
      };
      if (mId === 'eleven_multilingual_v2') {
        voiceSettings.style = 0.0;
        voiceSettings.use_speaker_boost = true;
      }
      const payload: Record<string, unknown> = {
        text: clean.slice(0, 2000),
        voice_settings: voiceSettings,
      };
      if (mId) payload.model_id = mId;

      return await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${vId}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let res = await callTts(voiceId, cfg.modelId || DEFAULT_MODEL_ID);

    // If model or voice was rejected, retry with canonical voice and multilingual v2 model
    if (!res.ok && (res.status === 400 || res.status === 404 || res.status === 422)) {
      const errText = await res.text();
      console.warn(`[nemo-voice] Initial ElevenLabs call failed (${res.status}: ${errText.slice(0, 100)}). Retrying with multilingual fallback...`);
      res = await callTts(DEFAULT_VOICE_ID, FALLBACK_MODEL_ID);
    }

    // If still failing, retry with canonical voice and no model_id specified
    if (!res.ok && (res.status === 400 || res.status === 404 || res.status === 422)) {
      res = await callTts(DEFAULT_VOICE_ID);
    }

    if (!res.ok) {
      const body = await res.text();
      let detail = body.slice(0, 200);
      try {
        const parsed = JSON.parse(body);
        if (parsed.detail?.message) detail = parsed.detail.message;
        else if (parsed.detail) detail = typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail);
      } catch {}

      if (res.status === 401 || res.status === 403) {
        throw new LessonError('MISSING_CREDENTIALS', `ElevenLabs rejected the API key: ${detail}`, [detail]);
      }
      if (res.status === 429) {
        throw new LessonError('RATE_LIMIT', `ElevenLabs quota or rate limit reached: ${detail}`, [detail]);
      }
      throw new LessonError('UNAVAILABLE', `ElevenLabs returned HTTP ${res.status}: ${detail}`, [detail]);
    }

    const audio = Buffer.from(await res.arrayBuffer());
    if (audio.byteLength === 0) {
      throw new LessonError('EMPTY_RESPONSE', 'ElevenLabs returned empty audio.');
    }
    const result: VoiceResult = { audio, contentType: 'audio/mpeg' };
    ttsCache.set(cacheKey, result);
    return result;
  } catch (err) {
    if (err instanceof LessonError) throw err;
    if ((err as Error).name === 'AbortError') {
      throw new LessonError('TIMEOUT', 'ElevenLabs did not respond in time.');
    }
    throw new LessonError('UNAVAILABLE', `Could not reach ElevenLabs: ${(err as Error).message}`);
  }
}

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: string;
  preview_url?: string;
}

/** Fetch all voices available to the user's ElevenLabs account. */
export async function fetchVoices(apiKey?: string): Promise<ElevenLabsVoice[]> {
  const key = (apiKey?.trim() || process.env.ELEVENLABS_API_KEY?.trim()) ?? '';
  if (!key) return [];
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': key },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { voices?: ElevenLabsVoice[] };
    return data.voices ?? [];
  } catch {
    return [];
  }
}

/** Credential check used by the config panel's status indicator. */
export async function checkVoice(cfg: VoiceConfig): Promise<{ ok: boolean; message?: string }> {
  const key = (cfg.apiKey?.trim() || process.env.ELEVENLABS_API_KEY?.trim()) ?? '';
  if (!key) return { ok: false, message: 'No API key' };
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': key },
    });
    if (res.ok) return { ok: true };
    const err = await res.text();
    return { ok: false, message: `HTTP ${res.status}: ${err.slice(0, 100)}` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
