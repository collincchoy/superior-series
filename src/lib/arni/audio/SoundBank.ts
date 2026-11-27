/**
 * Runtime audio (Web Audio). Plays synthesized sound effects and schedules
 * chiptune music. All the sound design lives in pure modules (sfx.ts,
 * music.ts, synth.ts); this class just makes noise.
 *
 * Browsers only allow audio after a user gesture, so the AudioContext is
 * created on the first tap/click/keypress. The context is suspended while
 * the tab is hidden and closed (with every listener removed) on destroy().
 */
import { noteToFreq, songEvents, SONGS, type NoteEvent, type SongId } from "./music.js";
import { loadSoundSettings, storeSoundSettings, toggle, type SoundSettings } from "./settings.js";
import { SFX, type SoundId } from "./sfx.js";
import { renderSfx } from "./synth.js";
import type { StorageLike } from "../save.js";

const MASTER = 0.6;
const MUSIC = 0.22;
const MUSIC_DUCKED = 0.08;
const SCHEDULE_EVERY_MS = 25;
const LOOKAHEAD_S = 0.15;
/** Sounds that repeat a lot get a little random pitch so they don't grate. */
const VARY: Partial<Record<SoundId, number>> = { jump: 0.05, coin: 0.04, whip: 0.08, land: 0.1, stomp: 0.05, enemyHit: 0.06 };

export class SoundBank {
  settings: SoundSettings;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private buffers = new Map<SoundId, AudioBuffer>();
  private noise: AudioBuffer | null = null;
  private wantSong: SongId | null = null;
  private playing: { id: SongId; start: number; until: number } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ducked = false;
  private destroyed = false;

  constructor(private storage: StorageLike) {
    this.settings = loadSoundSettings(storage);
    for (const ev of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(ev, this.unlock, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  private unlock = (): void => {
    if (this.destroyed) return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.settings.sfx ? 1 : 0;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.settings.music ? this.musicLevel() : 0;
      this.musicGain.connect(this.master);
      this.timer = setInterval(this.schedule, SCHEDULE_EVERY_MS);
    }
    if (this.ctx.state === "suspended" && !document.hidden) void this.ctx.resume();
  };

  private onVisibility = (): void => {
    if (!this.ctx || this.ctx.state === "closed") return;
    if (document.hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  };

  destroy(): void {
    this.destroyed = true;
    for (const ev of ["pointerdown", "keydown", "touchstart"]) window.removeEventListener(ev, this.unlock);
    document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.timer) clearInterval(this.timer);
    if (this.ctx && this.ctx.state !== "closed") void this.ctx.close();
    this.ctx = null;
  }

  // ── Settings ───────────────────────────────────────────────────

  toggle(which: keyof SoundSettings): SoundSettings {
    this.settings = toggle(this.settings, which);
    storeSoundSettings(this.storage, this.settings);
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.sfxGain.gain.setTargetAtTime(this.settings.sfx ? 1 : 0, t, 0.02);
      this.musicGain.gain.setTargetAtTime(this.settings.music ? this.musicLevel() : 0, t, 0.05);
    }
    return this.settings;
  }

  /** Quieter music while paused. */
  duck(on: boolean): void {
    this.ducked = on;
    if (this.ctx && this.settings.music) this.musicGain.gain.setTargetAtTime(this.musicLevel(), this.ctx.currentTime, 0.1);
  }

  private musicLevel(): number {
    return this.ducked ? MUSIC_DUCKED : MUSIC;
  }

  // ── Sound effects ──────────────────────────────────────────────

  play(id: SoundId): void {
    const ctx = this.ctx;
    if (!ctx || !this.settings.sfx || ctx.state !== "running") return;
    let buf = this.buffers.get(id);
    if (!buf) {
      const data = renderSfx(SFX[id], ctx.sampleRate);
      buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buf.getChannelData(0).set(data);
      this.buffers.set(id, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const vary = VARY[id];
    if (vary) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * vary;
    src.connect(this.sfxGain);
    src.start();
  }

  // ── Music ──────────────────────────────────────────────────────

  playMusic(id: SongId): void {
    this.wantSong = id;
    if (this.playing?.id === id) return;
    this.playing = null; // the scheduler starts the new song on its next tick
  }

  stopMusic(): void {
    this.wantSong = null;
    this.playing = null;
  }

  private schedule = (): void => {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running" || !this.wantSong) return;
    if (!this.playing) {
      const start = ctx.currentTime + 0.05;
      this.playing = { id: this.wantSong, start, until: start };
    }
    const song = SONGS[this.playing.id];
    const from = this.playing.until - this.playing.start;
    const to = ctx.currentTime + LOOKAHEAD_S - this.playing.start;
    if (to <= from) return;
    for (const ev of songEvents(song, from, to)) this.scheduleNote(ev, this.playing.start + ev.time);
    this.playing.until = this.playing.start + to;
  };

  private scheduleNote(ev: NoteEvent, at: number): void {
    const ctx = this.ctx!;
    if (ev.instrument === "drums") return this.scheduleDrum(ev.note, at);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = ev.instrument === "lead" ? "square" : "triangle";
    osc.frequency.value = noteToFreq(ev.note);
    const peak = ev.instrument === "lead" ? 0.16 : 0.45;
    const end = at + Math.max(0.05, ev.duration * 0.92);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.008);
    g.gain.exponentialRampToValueAtTime(peak * 0.5, at + Math.min(0.12, ev.duration * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0005, end);
    osc.connect(g).connect(this.musicGain);
    osc.start(at);
    osc.stop(end + 0.02);
  }

  private scheduleDrum(kind: string, at: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.connect(this.musicGain);
    if (kind === "k") {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(150, at);
      osc.frequency.exponentialRampToValueAtTime(40, at + 0.12);
      g.gain.setValueAtTime(0.9, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.15);
      osc.connect(g);
      osc.start(at);
      osc.stop(at + 0.16);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = kind === "h" ? 7000 : 1500;
    const len = kind === "h" ? 0.04 : 0.12;
    g.gain.setValueAtTime(kind === "h" ? 0.25 : 0.45, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + len);
    src.connect(filter).connect(g);
    src.start(at);
    src.stop(at + len + 0.01);
  }

  private noiseBuffer(): AudioBuffer {
    if (!this.noise) {
      const ctx = this.ctx!;
      const n = Math.floor(ctx.sampleRate * 0.2);
      this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }
}

/** A silent stand-in (e.g. if a scene runs without the game's SoundBank). */
export const SILENT = {
  play: () => {},
  playMusic: () => {},
  stopMusic: () => {},
  duck: () => {},
};
