import { describe, it, expect } from "vitest";
import { noteToFreq, parsePattern, songEvents, SONGS, songForLevel, stepSeconds, type Song } from "../../lib/arni/audio/music.js";

describe("noteToFreq", () => {
  it("A4 is 440Hz, octaves double", () => {
    expect(noteToFreq("A4")).toBeCloseTo(440, 6);
    expect(noteToFreq("A5")).toBeCloseTo(880, 6);
    expect(noteToFreq("C4")).toBeCloseTo(261.626, 2);
  });

  it("handles sharps and flats", () => {
    expect(noteToFreq("C#4")).toBeCloseTo(noteToFreq("Db4"), 6);
    expect(noteToFreq("F#3")).toBeCloseTo(184.997, 2);
  });

  it("rejects nonsense", () => {
    expect(() => noteToFreq("H2")).toThrow();
  });
});

describe("parsePattern", () => {
  it("reads notes, rests (.) and holds (-) one step each", () => {
    expect(parsePattern("C4 - . E4 | G4 - - .")).toEqual([
      { step: 0, steps: 2, note: "C4" },
      { step: 3, steps: 1, note: "E4" },
      { step: 4, steps: 3, note: "G4" },
    ]);
  });

  it("drum hits use letters (k kick, s snare, h hat)", () => {
    expect(parsePattern("k . h . s . h .")).toEqual([
      { step: 0, steps: 1, note: "k" },
      { step: 2, steps: 1, note: "h" },
      { step: 4, steps: 1, note: "s" },
      { step: 6, steps: 1, note: "h" },
    ]);
  });
});

describe("songs", () => {
  it("there's a volcano tune, a factory tune and a boss theme", () => {
    expect(Object.keys(SONGS).sort()).toEqual(["boss", "factory", "volcano"]);
  });

  for (const [id, song] of Object.entries(SONGS) as [string, Song][]) {
    it(`${id}: every track is the same length (so the loop lines up)`, () => {
      const lengths = song.tracks.map((t) => t.pattern.replace(/\|/g, " ").trim().split(/\s+/).length);
      expect(new Set(lengths).size).toBe(1);
      expect(lengths[0] % 16).toBe(0);
    });

    it(`${id}: all notes are valid`, () => {
      for (const t of song.tracks) {
        if (t.instrument === "drums") continue;
        for (const n of parsePattern(t.pattern)) expect(() => noteToFreq(n.note)).not.toThrow();
      }
    });
  }

  it("the boss theme is faster than the level tunes", () => {
    expect(SONGS.boss.bpm).toBeGreaterThan(SONGS.volcano.bpm);
    expect(SONGS.boss.bpm).toBeGreaterThan(SONGS.factory.bpm);
  });

  it("picks the tune by theme", () => {
    expect(songForLevel("volcano")).toBe("volcano");
    expect(songForLevel("factory")).toBe("factory");
  });
});

describe("songEvents (what to schedule in a time window)", () => {
  const song: Song = {
    bpm: 120,
    tracks: [{ instrument: "lead", pattern: "C4 . E4 . G4 . . . C5 . . . . . . ." }],
  };
  const step = stepSeconds(song); // 16th notes

  it("a step is a sixteenth note", () => {
    expect(step).toBeCloseTo(60 / 120 / 4, 9);
  });

  it("returns the notes that start inside the window, with times and lengths", () => {
    const evs = songEvents(song, 0, step * 4.5);
    expect(evs.map((e) => e.note)).toEqual(["C4", "E4", "G4"]);
    expect(evs[1].time).toBeCloseTo(step * 2, 9);
    expect(evs[0].duration).toBeCloseTo(step, 9);
  });

  it("loops forever", () => {
    const loop = step * 16;
    const evs = songEvents(song, loop, loop + step * 0.5);
    expect(evs).toHaveLength(1);
    expect(evs[0].note).toBe("C4");
    expect(evs[0].time).toBeCloseTo(loop, 9);
  });

  it("windows don't double-schedule: back-to-back windows cover each note once", () => {
    const a = songEvents(song, 0, step * 3);
    const b = songEvents(song, step * 3, step * 16);
    expect([...a, ...b].map((e) => e.note)).toEqual(["C4", "E4", "G4", "C5"]);
  });
});
