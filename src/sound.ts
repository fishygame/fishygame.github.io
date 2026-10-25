// Background music and sound effects. The songs (see music.ts) and the eating sounds are recorded
// clips in src/assets; the getting-eaten sound is synthesized with the Web Audio API. Browsers only
// allow audio after a user gesture, so call start() from a key or click handler.

import burpUrl from "./assets/burp.mp3";
import gulpUrl from "./assets/gulp.mp3";
import { TRACKS } from "./music";

const VOLUME = 0.16;
const MUSIC_GAIN = 0.8; // the songs are mastered loud; this keeps the eating sounds easy to hear
const SONG_FADE = 0.3; // seconds to fade a song out when switching to another

/** Picked on the title menu. */
export type EatSound = "gulp" | "burp";

// The eating sounds: where each starts in its clip (skipping silence up front), how long it lasts
// (the gulp has a little click after the swallow), and a gain that sits it just above the music.
const EAT_SOUNDS: Record<EatSound, { url: string; offset: number; length?: number; gain: number }> = {
  gulp: { url: gulpUrl, offset: 0.15, length: 0.25, gain: 2 },
  burp: { url: burpUrl, offset: 0.17, gain: 6 },
};

/** A copy of the list in random order. */
function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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
  private eatClips: Partial<Record<EatSound, AudioBuffer>> = {};
  eatSound: EatSound = "gulp";
  muted = false;
  private paused = false;
  // Songs play one after another from the playlist. Only the one playing is decoded (a decoded
  // song is ~70 MB); the next one is just downloaded ahead of time.
  private playlist: string[] = TRACKS.map((t) => t.id); // ids of the songs switched on
  private shuffle = true;
  private bag: string[] = []; // shuffle: songs still to come before any repeats
  private current: string | null = null; // the song playing, or loading to play
  private song: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private fetched = new Map<string, Promise<ArrayBuffer>>();
  private songId = 0; // bumped on every change of song, so a slow download can't start a stale one
  /** Called when a different song starts (or the music stops, with null). */
  onSongChange: ((id: string | null) => void) | null = null;

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

    for (const [kind, { url }] of Object.entries(EAT_SOUNDS) as [EatSound, { url: string }][]) {
      loadClip(ctx, url)
        .then((clip) => (this.eatClips[kind] = clip))
        .catch((err) => console.warn(`couldn't load the ${kind} sound`, err));
    }

    this.playSong(this.songAfter(null));
  }

  // ---- music ----

  /** Which songs can play (ids), and whether in random order or the order of TRACKS. */
  setPlaylist(ids: string[], shuffle: boolean): void {
    this.playlist = TRACKS.map((t) => t.id).filter((id) => ids.includes(id));
    if (shuffle !== this.shuffle) this.bag = [];
    this.shuffle = shuffle;
    if (!this.ctx) return;
    // the song playing was just switched off, or one was switched on after silence
    if (this.current ? !this.playlist.includes(this.current) : this.playlist.length) this.nextSong();
    else this.fetchNext();
  }

  /** Skip to the next song. */
  nextSong(): void {
    if (this.ctx) this.playSong(this.songAfter(this.current));
  }

  /** Play this song from the start, fading out the one playing (null: stop the music). */
  playSong(id: string | null): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const songId = ++this.songId;
    this.stopSong();
    this.current = id;
    this.onSongChange?.(id);
    if (!id) return;
    this.bag = this.bag.filter((x) => x !== id);
    this.fetchSong(id)
      .then((bytes) => {
        this.fetched.delete(id); // decoding uses the bytes up
        return ctx.decodeAudioData(bytes);
      })
      .then((buffer) => {
        if (songId !== this.songId) return;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const gain = ctx.createGain();
        src.connect(gain).connect(this.musicBus);
        src.onended = () => {
          if (this.song?.src === src) this.nextSong();
        };
        src.start();
        this.song = { src, gain };
        this.fetchNext();
      })
      .catch((err) => console.warn(`couldn't play the song ${id}`, err));
  }

  private stopSong(): void {
    const song = this.song;
    if (!song) return;
    this.song = null;
    const t = this.ctx!.currentTime;
    song.gain.gain.setTargetAtTime(0, t, SONG_FADE / 4);
    song.src.stop(t + SONG_FADE);
  }

  /** The song to play after `id`. With only one song on, that's the same one again. */
  private songAfter(id: string | null): string | null {
    const list = this.playlist;
    if (!list.length) return null;
    if (this.shuffle) {
      this.bag = this.bag.filter((x) => list.includes(x) && x !== id);
      if (!this.bag.length) this.bag = shuffled(list.filter((x) => x !== id));
      return this.bag[0] ?? id;
    }
    // in order: the next song that's on, after this one in the full list, wrapping around
    const all = TRACKS.map((t) => t.id);
    const i = id ? all.indexOf(id) : -1;
    for (let k = 1; k <= all.length; k++) {
      const next = all[(i + k) % all.length];
      if (list.includes(next)) return next;
    }
    return null;
  }

  /** Download the song that's up next, so it starts straight away; forget any others. */
  private fetchNext(): void {
    const next = this.songAfter(this.current);
    for (const id of this.fetched.keys()) if (id !== next) this.fetched.delete(id);
    if (next) this.fetchSong(next).catch(() => {}); // it'll be tried again when it's due
  }

  private fetchSong(id: string): Promise<ArrayBuffer> {
    let bytes = this.fetched.get(id);
    if (!bytes) {
      const url = TRACKS.find((t) => t.id === id)!.url;
      bytes = fetch(url).then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.arrayBuffer();
      });
      bytes.catch(() => this.fetched.delete(id));
      this.fetched.set(id, bytes);
    }
    return bytes;
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

  /** Play the eating sound. `size` 0..1: bigger meals play it slower, so it's deeper and longer. */
  eat(size: number): void {
    const ctx = this.ctx;
    const clip = this.eatClips[this.eatSound];
    if (!ctx || !clip) return;
    const { offset, length, gain } = EAT_SOUNDS[this.eatSound];
    const src = ctx.createBufferSource();
    src.buffer = clip;
    src.playbackRate.value = (1.2 - 0.45 * size) * (0.95 + Math.random() * 0.1);
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.master);
    src.start(ctx.currentTime, offset, length);
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

  /** Hooked: a reel clicking away faster and faster, under a slide whistle going up. */
  caught(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = 1.4;

    this.musicBus.gain.setTargetAtTime(0.15, t, 0.05);
    this.musicBus.gain.setTargetAtTime(MUSIC_GAIN, t + 2.4, 0.4);

    // reel ratchet: clicks that speed up as the line winds in
    for (let at = 0, gap = 0.09; at < len; at += gap, gap = Math.max(0.025, gap * 0.9)) {
      this.noiseBurst(this.master, t + at, "bandpass", 3200, 0.5, 0.018);
    }

    const whistle = ctx.createOscillator();
    whistle.frequency.setValueAtTime(220, t);
    whistle.frequency.exponentialRampToValueAtTime(1600, t + len);
    const vib = ctx.createOscillator();
    vib.frequency.value = 7;
    const vibDepth = ctx.createGain();
    vibDepth.gain.value = 12;
    vib.connect(vibDepth).connect(whistle.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.6, t + 0.05);
    g.gain.setValueAtTime(0.6, t + len - 0.15);
    g.gain.linearRampToValueAtTime(0, t + len);
    whistle.connect(g).connect(this.master);
    whistle.start(t);
    vib.start(t);
    whistle.stop(t + len + 0.05);
    vib.stop(t + len + 0.05);
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
