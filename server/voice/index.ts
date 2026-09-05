/**
 * NEMO — voice providers.
 *
 * ElevenLabs is the only real voice. If it is unavailable the UI shows
 * "VOICE UNAVAILABLE" and the lesson continues silently. The browser's
 * SpeechSynthesis is never used as a substitute — a different voice appearing
 * without the user asking for it is a worse failure than silence.
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

/** ElevenLabs' well-known "Rachel" voice: a sane default for a demo machine. */
const DEFAULT_VOICE_ID = 'hpp4J3VqNfWAUOO0d1Us';
const DEFAULT_MODEL_ID = 'eleven_flash_v2_5';

export function resolveVoiceConfig(body: Partial<VoiceConfig> | undefined): VoiceConfig {
  const env = process.env;
  const apiKey = body?.apiKey?.trim() || env.ELEVENLABS_API_KEY;
  const provider = body?.provider ?? (apiKey ? 'elevenlabs' : 'none');
  return {
    provider,
    apiKey,
    voiceId: body?.voiceId?.trim() || env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID,
    modelId: body?.modelId?.trim() || env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID,
  };
}

/** In-memory TTS audio cache for demo lines and repeated narrations. */
const ttsCache = new Map<string, VoiceResult>();

export async function synthesize(cfg: VoiceConfig, text: string): Promise<VoiceResult> {
  const clean = text.trim();
  if (!clean) throw new LessonError('UNSUPPORTED', 'Nothing to speak.');

  const voiceId = cfg.voiceId || DEFAULT_VOICE_ID;
  const cacheKey = `${voiceId}:${clean}`;
  const cached = ttsCache.get(cacheKey);
  if (cached) return cached;

  const apiKey = cfg.apiKey || process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new LessonError(
      'MISSING_CREDENTIALS',
      'No ElevenLabs API key configured. Add one in the config panel or set ELEVENLABS_API_KEY.'
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: clean.slice(0, 2000),
          model_id: cfg.modelId || DEFAULT_MODEL_ID,
          voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true },
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 401 || res.status === 403) {
        throw new LessonError('MISSING_CREDENTIALS', 'ElevenLabs rejected the API key.', [
          body.slice(0, 200),
        ]);
      }
      if (res.status === 429) {
        throw new LessonError('RATE_LIMIT', 'ElevenLabs rate limit reached.', [body.slice(0, 200)]);
      }
      throw new LessonError('UNAVAILABLE', `ElevenLabs returned HTTP ${res.status}.`, [
        body.slice(0, 200),
      ]);
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
  } finally {
    clearTimeout(timer);
  }
}

/** Cheap credential check used by the config panel's status dot. */
export async function checkVoice(cfg: VoiceConfig): Promise<boolean> {
  if (cfg.provider !== 'elevenlabs' || !cfg.apiKey) return false;
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': cfg.apiKey },
    });
    return res.ok;
  } catch {
    return false;
  }
}
