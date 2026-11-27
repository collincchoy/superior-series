/**
 * Chiptune music as readable note patterns, plus the timing math to
 * schedule them. Pure — the SoundBank turns events into oscillators.
 *
 * Pattern tokens (one per 16th-note step, `|` is just a bar divider):
 *   C5 / F#3 / Bb4  a note      .  rest      -  hold the previous note
 *   k / s / h       drums: kick, snare, hi-hat
 */
import type { Theme } from "../assets.js";

export type Instrument = "lead" | "bass" | "drums";

export interface Track {
  instrument: Instrument;
  pattern: string;
}

export interface Song {
  bpm: number;
  tracks: Track[];
}

export interface NoteEvent {
  /** Seconds from the start of the song. */
  time: number;
  duration: number;
  note: string;
  instrument: Instrument;
}

const SEMITONES: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

export function noteToFreq(note: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(note);
  if (!m) throw new Error(`Not a note: ${note}`);
  const [, letter, accidental, octave] = m;
  const semis = SEMITONES[letter] + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0) + (Number(octave) - 4) * 12;
  return 440 * Math.pow(2, semis / 12);
}

export interface PatternNote {
  step: number;
  steps: number;
  note: string;
}

function tokens(pattern: string): string[] {
  return pattern.replace(/\|/g, " ").trim().split(/\s+/);
}

export function parsePattern(pattern: string): PatternNote[] {
  const out: PatternNote[] = [];
  let current: PatternNote | null = null;
  tokens(pattern).forEach((tok, step) => {
    if (tok === "-") {
      if (current) current.steps++;
      return;
    }
    current = null;
    if (tok === ".") return;
    current = { step, steps: 1, note: tok };
    out.push(current);
  });
  return out;
}

/** Length of one step (a 16th note) in seconds. */
export function stepSeconds(song: Song): number {
  return 60 / song.bpm / 4;
}

function songSteps(song: Song): number {
  return tokens(song.tracks[0].pattern).length;
}

/** Notes that start in [t0, t1), looping the song forever. */
export function songEvents(song: Song, t0: number, t1: number): NoteEvent[] {
  const step = stepSeconds(song);
  const loop = songSteps(song) * step;
  const events: NoteEvent[] = [];
  const firstLoop = Math.floor(t0 / loop);
  const lastLoop = Math.floor(t1 / loop);
  for (const track of song.tracks) {
    const notes = parsePattern(track.pattern);
    for (let k = firstLoop; k <= lastLoop; k++) {
      for (const n of notes) {
        const time = k * loop + n.step * step;
        if (time >= t0 - 1e-9 && time < t1 - 1e-9) {
          events.push({ time, duration: n.steps * step, note: n.note, instrument: track.instrument });
        }
      }
    }
  }
  return events.sort((a, b) => a.time - b.time);
}

// ── The tunes (all original) ───────────────────────────────────────

const DRUMS_BOUNCY = "k . h . s . h . k . h . s . h h";

export const SONGS = {
  /** Bouncy and sunny — the volcanic jungle (levels 1–5). */
  volcano: {
    bpm: 132,
    tracks: [
      {
        instrument: "lead",
        pattern: [
          "C5 . E5 . G5 . E5 . C5 . D5 . E5 - - .",
          "F5 . E5 . D5 . C5 . D5 - . . G4 - . .",
          "C5 . E5 . G5 . A5 . G5 . E5 . C5 - . .",
          "D5 . F5 . E5 . D5 . C5 - - - . . . .",
        ].join(" | "),
      },
      {
        instrument: "bass",
        pattern: [
          "C3 . G2 . C3 . G2 . C3 . G2 . C3 . G2 .",
          "F2 . C3 . F2 . C3 . G2 . D3 . G2 . D3 .",
          "C3 . G2 . C3 . G2 . A2 . E3 . A2 . E3 .",
          "F2 . C3 . G2 . D3 . C3 . G2 . C3 . . .",
        ].join(" | "),
      },
      { instrument: "drums", pattern: [DRUMS_BOUNCY, DRUMS_BOUNCY, DRUMS_BOUNCY, DRUMS_BOUNCY].join(" | ") },
    ],
  },

  /** Clanky and sneaky — Rex's Banana Factory (levels 6–10). */
  factory: {
    bpm: 116,
    tracks: [
      {
        instrument: "lead",
        pattern: [
          "A4 . . A4 C5 . A4 . E5 . D5 . C5 . B4 .",
          "A4 . . A4 C5 . A4 . G4 - . . E4 - . .",
          "A4 . . A4 C5 . E5 . F5 . E5 . D5 . C5 .",
          "B4 . G4 . A4 - - - . . E4 . A4 - . .",
        ].join(" | "),
      },
      {
        instrument: "bass",
        pattern: [
          "A2 A2 . A2 . A2 E2 . A2 A2 . A2 . A2 G2 .",
          "F2 F2 . F2 . F2 C2 . G2 G2 . G2 . G2 D2 .",
          "A2 A2 . A2 . A2 E2 . D2 D2 . D2 . D2 A2 .",
          "E2 E2 . E2 . E2 B2 . A2 A2 . A2 . A2 E2 .",
        ].join(" | "),
      },
      { instrument: "drums", pattern: Array(4).fill("k . h h s . h . k k h . s . h h").join(" | ") },
    ],
  },

  /** Fast and urgent — any Rex fight. */
  boss: {
    bpm: 156,
    tracks: [
      {
        instrument: "lead",
        pattern: [
          "E5 . E5 . G5 . E5 . B5 . A5 . G5 . F#5 .",
          "E5 . E5 . G5 . E5 . D5 - . . B4 - . .",
          "C5 . C5 . E5 . C5 . G5 . F#5 . E5 . D5 .",
          "B4 . D5 . F#5 . A5 . B5 - - - . . . .",
        ].join(" | "),
      },
      {
        instrument: "bass",
        pattern: [
          "E2 . E3 . E2 . E3 . E2 . E3 . E2 . E3 .",
          "E2 . E3 . E2 . E3 . D2 . D3 . D2 . D3 .",
          "C2 . C3 . C2 . C3 . C2 . C3 . C2 . C3 .",
          "B1 . B2 . B1 . B2 . B1 . B2 . B1 . B2 .",
        ].join(" | "),
      },
      { instrument: "drums", pattern: Array(4).fill("k . h . s . h k k . h . s . s s").join(" | ") },
    ],
  },
} satisfies Record<string, Song>;

export type SongId = keyof typeof SONGS;

export function songForLevel(theme: Theme): SongId {
  return theme === "factory" ? "factory" : "volcano";
}
