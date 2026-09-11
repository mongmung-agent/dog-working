import type { ThemeId } from './themes';

type Track = {
  theme: ThemeId;
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
};
/** Stream only the selected theme. Instrument banks never reach the browser. */
export class ThemeMusic {
  private current?: Track;
  private retiring?: Track;
  private cleanup?: ReturnType<typeof setTimeout>;
  private enabled = false;
  constructor(
    private readonly context: AudioContext,
    private readonly output: GainNode,
  ) {}
  private dispose(track?: Track) {
    if (!track) return;
    track.audio.pause();
    track.audio.removeAttribute('src');
    track.audio.load();
    track.source.disconnect();
    track.gain.disconnect();
  }
  apply(theme: ThemeId, enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      if (this.current) {
        this.current.audio.pause();
        this.current.gain.gain.cancelScheduledValues(this.context.currentTime);
        this.current.gain.gain.value = 0;
      }
      clearTimeout(this.cleanup);
      this.dispose(this.retiring);
      this.retiring = undefined;
      return;
    }
    if (this.current?.theme !== theme) {
      clearTimeout(this.cleanup);
      this.dispose(this.retiring);
      this.retiring = this.current;
      if (this.retiring) {
        const old = this.retiring;
        old.gain.gain.cancelScheduledValues(this.context.currentTime);
        old.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.4);
        this.cleanup = setTimeout(() => {
          this.dispose(old);
          if (this.retiring === old) this.retiring = undefined;
        }, 2000);
      }
      const audio = new Audio();
      audio.preload = 'none';
      audio.loop = true;
      audio.src = `/music/${theme}.m4a?v=gemini-1`;
      const source = this.context.createMediaElementSource(audio),
        gain = this.context.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(this.output);
      this.current = { theme, audio, source, gain };
    }
    const track = this.current;
    // Calling play here (inside the user's gesture) preserves mobile autoplay permissions.
    void track.audio
      .play()
      .then(() => {
        if (!this.enabled || this.current !== track) {
          track.audio.pause();
          return;
        }
        track.gain.gain.cancelScheduledValues(this.context.currentTime);
        track.gain.gain.setTargetAtTime(1, this.context.currentTime, 0.4);
      })
      .catch(() => {
        /* A later sound toggle retries blocked playback or a network error. */
      });
  }
}
