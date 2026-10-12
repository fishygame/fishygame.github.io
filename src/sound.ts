// Background music and sound effects. The music and the burp are recorded clips in src/assets;
// the getting-eaten sound is synthesized with the Web Audio API. Browsers only allow audio after
// a user gesture, so call start() from a key or click handler.

import burpUrl from "./assets/burp.mp3";
import musicUrl from "./assets/music.mp3";

const VOLUME = 0.16;
const MUSIC_GAIN = 0.8; // the track is mastered loud; this keeps the burps easy to hear

// The track has a moment of silence at the start and fades out at the end; loop just the music.
const MUSIC_LOOP_START = 0.17;
const MUSIC_LOOP_END = 212.2;

// The clip has ~0.19s of silence up front; skip it so the burp lands right on the bite.
const BURP_OFFSET = 0.17;
const BURP_GAIN = 6; // the clip is fairly quiet; this sits it just above the music

/** Fetch and decode an audio file. */
async function loadClip(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  return ctx.decodeAudioData(await res.arrayBuffer());
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private burpClip: AudioBuffer | null = null;
  muted = false;
  private paused = false;

  start(): void {
    if (this.ctx) {
      // iOS can also leave it "interrupted" (after a call, say), so resume anything not running
      if (this.ctx.state !== "running" && !this.paused) void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : VOLUME;
    this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = MUSIC_GAIN;
    this.musicBus.connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    loadClip(ctx, burpUrl)
      .then((clip) => (this.burpClip = clip))
      .catch((err) => console.warn("couldn't load the burp sound", err));

    loadClip(ctx, musicUrl)
      .then((clip) => {
        const src = ctx.createBufferSource();
        src.buffer = clip;
        src.loop = true;
        src.loopStart = MUSIC_LOOP_START;
        src.loopEnd = Math.min(MUSIC_LOOP_END, clip.duration);
        src.connect(this.musicBus);
        src.start(ctx.currentTime, MUSIC_LOOP_START);
      })
      .catch((err) => console.warn("couldn't load the music", err));
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : VOLUME, this.ctx.currentTime, 0.05);
    }
  }

  /** Freeze the music (and any sound mid-play) while the game is paused. */
  setPaused(p: boolean): void {
    this.paused = p;
    if (!this.ctx) return;
    if (p) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  // ---- sound effects ----

  /** Play the burp clip. `size` 0..1: bigger meals play it slower, so it's deeper and longer. */
  burp(size: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.burpClip) return;
    const src = ctx.createBufferSource();
    src.buffer = this.burpClip;
    src.playbackRate.value = (1.2 - 0.45 * size) * (0.95 + Math.random() * 0.1);
    const g = ctx.createGain();
    g.gain.value = BURP_GAIN;
    src.connect(g).connect(this.master);
    src.start(ctx.currentTime, BURP_OFFSET);
  }

  /** Cartoon defeat: CHOMP, a slide whistle falling away, then a few sad bubbles. */
  eaten(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;

    this.musicBus.gain.setTargetAtTime(0.15, t, 0.05);
    this.musicBus.gain.setTargetAtTime(MUSIC_GAIN, t + 2.6, 0.4);

    // chomp-chomp: a crunchy snap over a low thud
    for (const [at, level] of [[0, 1], [0.16, 0.7]]) {
      this.noiseBurst(this.master, t + at, "bandpass", 1100, 0.9 * level, 0.1);
      const thud = ctx.createOscillator();
      thud.frequency.setValueAtTime(160, t + at);
      thud.frequency.exponentialRampToValueAtTime(45, t + at + 0.15);
      const g = ctx.createGain();
      g.gain.setValueAtTime(1.3 * level, t + at);
      g.gain.exponentialRampToValueAtTime(0.001, t + at + 0.18);
      thud.connect(g).connect(this.master);
      thud.start(t + at);
      thud.stop(t + at + 0.2);
    }

    // slide whistle falling, getting wobblier as it goes
    const s0 = t + 0.4;
    const slideLen = 1.1;
    const whistle = ctx.createOscillator();
    whistle.frequency.setValueAtTime(1500, s0);
    whistle.frequency.exponentialRampToValueAtTime(170, s0 + slideLen);
    const vib = ctx.createOscillator();
    vib.frequency.value = 7;
    const vibDepth = ctx.createGain();
    vibDepth.gain.setValueAtTime(5, s0);
    vibDepth.gain.linearRampToValueAtTime(30, s0 + slideLen);
    vib.connect(vibDepth).connect(whistle.frequency);
    const wg = ctx.createGain();
    wg.gain.setValueAtTime(0, s0);
    wg.gain.linearRampToValueAtTime(0.75, s0 + 0.04);
    wg.gain.setValueAtTime(0.75, s0 + slideLen - 0.15);
    wg.gain.linearRampToValueAtTime(0, s0 + slideLen);
    whistle.connect(wg).connect(this.master);
    whistle.start(s0);
    vib.start(s0);
    whistle.stop(s0 + slideLen + 0.05);
    vib.stop(s0 + slideLen + 0.05);

    // blub, blub, bloop
    [0, 0.17, 0.34].forEach((at, i) => {
      const b0 = s0 + slideLen + 0.1 + at;
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(260 + i * 60, b0);
      osc.frequency.exponentialRampToValueAtTime(900 + i * 200, b0 + 0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, b0);
      g.gain.linearRampToValueAtTime(0.7, b0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, b0 + 0.11);
      osc.connect(g).connect(this.master);
      osc.start(b0);
      osc.stop(b0 + 0.12);
    });
  }

  private noiseBurst(
    dest: AudioNode,
    t: number,
    type: BiquadFilterType,
    freq: number,
    gain: number,
    dur: number,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(dest);
    src.start(t);
    src.stop(t + dur + 0.01);
  }
}
