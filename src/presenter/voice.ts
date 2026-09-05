/**
 * NEMO — narration playback.
 *
 * Audio comes from the backend, which calls ElevenLabs. There is deliberately
 * no `window.speechSynthesis` path anywhere in this file or the app: if
 * ElevenLabs is unavailable the UI says VOICE UNAVAILABLE and the lesson runs
 * silently. Swapping in a different voice without being asked would be a worse
 * outcome than silence.
 */

export type VoiceStatus = 'disabled' | 'ready' | 'speaking' | 'unavailable';

export interface VoiceSettings {
  enabled: boolean;
  apiKey: string;
  voiceId: string;
  modelId: string;
}

export interface VoiceCallbacks {
  onStatus(status: VoiceStatus, detail?: string): void;
}

export class VoiceController {
  private cache = new Map<string, Promise<string | null>>();
  private current: HTMLAudioElement | null = null;
  private settings: VoiceSettings;
  private cb: VoiceCallbacks;
  /** Once ElevenLabs has failed, stop hammering it for the rest of the lesson. */
  private failed = false;

  constructor(settings: VoiceSettings, cb: VoiceCallbacks) {
    this.settings = settings;
    this.cb = cb;
  }

  update(settings: VoiceSettings): void {
    const changed =
      settings.apiKey !== this.settings.apiKey ||
      settings.voiceId !== this.settings.voiceId ||
      settings.modelId !== this.settings.modelId;
    this.settings = settings;
    if (changed) {
      this.cache.clear();
      this.failed = false;
    }
  }

  reset(): void {
    this.failed = false;
    this.cache.clear();
  }

  private get active(): boolean {
    return this.settings.enabled && !this.failed;
  }

  /** Fetch (and cache) the audio for a line without playing it. */
  prefetch(text: string): Promise<string | null> {
    const clean = text?.trim();
    if (!clean || !this.active) return Promise.resolve(null);
    const cached = this.cache.get(clean);
    if (cached) return cached;

    const p = (async () => {
      try {
        const res = await fetch('/api/voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: clean,
            voice: {
              provider: 'elevenlabs',
              apiKey: this.settings.apiKey,
              voiceId: this.settings.voiceId,
              modelId: this.settings.modelId,
            },
          }),
        });
        if (!res.ok) {
          let message = `HTTP ${res.status}`;
          try {
            const body = (await res.json()) as { error?: { message?: string } };
            if (body.error?.message) message = body.error.message;
          } catch {
            // Keep the status-code message.
          }
          this.failed = true;
          this.cb.onStatus('unavailable', message);
          return null;
        }
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      } catch (err) {
        this.failed = true;
        this.cb.onStatus('unavailable', (err as Error).message);
        return null;
      }
    })();

    this.cache.set(clean, p);
    return p;
  }

  /** Speak a line. Resolves when playback finishes, or immediately if silent. */
  async speak(text: string): Promise<void> {
    const clean = text?.trim();
    if (!clean) return;
    if (!this.settings.enabled) {
      this.cb.onStatus('disabled');
      return;
    }
    const url = await this.prefetch(clean);
    if (!url) return;

    this.stop();
    return new Promise<void>((resolve) => {
      const audio = new Audio(url);
      this.current = audio;
      const done = () => {
        if (this.current === audio) this.current = null;
        this.cb.onStatus('ready');
        resolve();
      };
      audio.onended = done;
      audio.onerror = () => {
        this.cb.onStatus('unavailable', 'Audio playback failed.');
        done();
      };
      this.cb.onStatus('speaking');
      void audio.play().catch(() => {
        // Autoplay can be blocked until the page has been interacted with.
        // Submitting a question counts, so this is rare; report it either way.
        this.cb.onStatus('unavailable', 'Browser blocked audio playback.');
        done();
      });
    });
  }

  stop(): void {
    if (this.current) {
      this.current.pause();
      this.current.currentTime = 0;
      this.current = null;
    }
  }

  dispose(): void {
    this.stop();
    for (const p of this.cache.values()) {
      void p.then((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    }
    this.cache.clear();
  }
}
