import { describe, it, expect } from "vitest";
import { renderSfx, type SfxRecipe } from "../../lib/arni/audio/synth.js";
import { SFX, SFX_IDS } from "../../lib/arni/audio/sfx.js";

const SR = 22050;
const peak = (b: Float32Array) => b.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const rms = (b: Float32Array) => Math.sqrt(b.reduce((s, v) => s + v * v, 0) / b.length);

/** Count sign changes — a rough pitch measure. */
const crossings = (b: Float32Array) => {
  let n = 0;
  for (let i = 1; i < b.length; i++) if (b[i - 1] < 0 !== b[i] < 0) n++;
  return n;
};

describe("renderSfx", () => {
  const beep: SfxRecipe = { wave: "square", freq: 440, ms: 200 };

  it("is exactly as long as the recipe says", () => {
    expect(renderSfx(beep, SR).length).toBe(Math.round(0.2 * SR));
  });

  it("never clips", () => {
    const loud: SfxRecipe = { wave: "square", freq: 220, ms: 100, volume: 3, layers: [{ wave: "saw", freq: 330, ms: 100, volume: 3 }] };
    expect(peak(renderSfx(loud, SR))).toBeLessThanOrEqual(1);
  });

  it("fades out to silence at the end (no clicks)", () => {
    const b = renderSfx(beep, SR);
    expect(Math.abs(b[b.length - 1])).toBeLessThan(0.01);
    expect(Math.abs(b[0])).toBeLessThan(0.05);
  });

  it("is deterministic — even noise", () => {
    const noise: SfxRecipe = { wave: "noise", freq: 0, ms: 80 };
    expect(renderSfx(noise, SR)).toEqual(renderSfx(noise, SR));
  });

  it("a pitch sweep up gets higher", () => {
    const b = renderSfx({ wave: "sine", freq: 200, freqEnd: 1600, ms: 400, attackMs: 0 }, SR);
    const half = b.length / 2;
    expect(crossings(b.slice(half))).toBeGreaterThan(crossings(b.slice(0, half)) * 2);
  });

  it("arpeggio steps change the pitch over time", () => {
    const flat = renderSfx({ wave: "sine", freq: 400, ms: 300, attackMs: 0 }, SR);
    const arp = renderSfx({ wave: "sine", freq: 400, ms: 300, attackMs: 0, arp: [0, 12] }, SR);
    const half = flat.length / 2;
    expect(crossings(arp.slice(half))).toBeGreaterThan(crossings(flat.slice(half)) * 1.6);
  });

  it("volume scales loudness", () => {
    const quiet = renderSfx({ ...beep, volume: 0.2 }, SR);
    const loud = renderSfx({ ...beep, volume: 0.8 }, SR);
    expect(rms(loud)).toBeGreaterThan(rms(quiet) * 3);
  });
});

describe("the sound-effect list", () => {
  it("every effect renders to something audible and short", () => {
    for (const id of SFX_IDS) {
      const b = renderSfx(SFX[id], SR);
      expect(rms(b), id).toBeGreaterThan(0.01);
      expect(b.length / SR, id).toBeLessThanOrEqual(2.5);
      expect(peak(b), id).toBeLessThanOrEqual(1);
    }
  });

  it("covers the core moments of play", () => {
    for (const id of ["jump", "whip", "stomp", "coin", "egg", "hurt", "powerUp", "rexHit", "victory"] as const) {
      expect(SFX_IDS).toContain(id);
    }
  });
});
