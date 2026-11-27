/**
 * Tiny retro synth: turns a sound-effect "recipe" into raw samples.
 * Pure and deterministic (noise uses a seeded generator), so it's unit-tested;
 * the runtime just copies the samples into an AudioBuffer.
 */

export type Wave = "square" | "sine" | "triangle" | "saw" | "noise";

export interface SfxRecipe {
  wave: Wave;
  /** Start frequency (Hz). Ignored for noise. */
  freq: number;
  /** End frequency for an exponential sweep. */
  freqEnd?: number;
  ms: number;
  /** 0..1 (before mixing). Default 0.5. */
  volume?: number;
  /** Fade-in time. Default 5ms (avoids clicks). */
  attackMs?: number;
  /** Semitone steps, played evenly across the sound (e.g. [0, 4, 7] = major arpeggio). */
  arp?: number[];
  /** Wobble: rate (Hz) and depth (fraction of the frequency). */
  vibrato?: { hz: number; depth: number };
  /** Square-wave duty cycle. Default 0.5. */
  duty?: number;
  /** Extra sounds mixed in (rendered over the same length as their own `ms`). */
  layers?: SfxRecipe[];
}

/** Small seeded PRNG so noise sounds the same every time. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function renderLayer(r: SfxRecipe, sampleRate: number, length: number): Float32Array {
  const out = new Float32Array(length);
  const own = Math.min(length, Math.round((r.ms / 1000) * sampleRate));
  const vol = r.volume ?? 0.5;
  const attack = Math.max(0, Math.round(((r.attackMs ?? 5) / 1000) * sampleRate));
  const duty = r.duty ?? 0.5;
  const rand = mulberry32(0x5eed + Math.round(r.freq) + own);
  let phase = 0;
  for (let i = 0; i < own; i++) {
    const t = i / own;
    let f = r.freqEnd ? r.freq * Math.pow(r.freqEnd / r.freq, t) : r.freq;
    if (r.arp?.length) f *= Math.pow(2, r.arp[Math.min(r.arp.length - 1, Math.floor(t * r.arp.length))] / 12);
    if (r.vibrato) f *= 1 + r.vibrato.depth * Math.sin((2 * Math.PI * r.vibrato.hz * i) / sampleRate);
    phase += f / sampleRate;
    const p = phase - Math.floor(phase);
    let v: number;
    switch (r.wave) {
      case "square":
        v = p < duty ? 1 : -1;
        break;
      case "saw":
        v = 2 * p - 1;
        break;
      case "triangle":
        v = 1 - 4 * Math.abs(p - 0.5);
        break;
      case "sine":
        v = Math.sin(2 * Math.PI * phase);
        break;
      case "noise":
        v = rand() * 2 - 1;
        break;
    }
    // Envelope: quick fade-in, then a smooth decay that reaches 0 at the end (no clicks).
    const env = (attack > 0 && i < attack ? i / attack : 1) * (1 - t) * (1 - t);
    out[i] = v * env * vol;
  }
  return out;
}

export function renderSfx(recipe: SfxRecipe, sampleRate: number): Float32Array {
  const length = Math.round((recipe.ms / 1000) * sampleRate);
  const mix = renderLayer(recipe, sampleRate, length);
  for (const layer of recipe.layers ?? []) {
    const l = renderLayer(layer, sampleRate, length);
    for (let i = 0; i < length; i++) mix[i] += l[i];
  }
  // Normalize instead of hard-clipping if the layers add up too loud.
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(mix[i]));
  if (peak > 0.95) {
    const k = 0.95 / peak;
    for (let i = 0; i < length; i++) mix[i] *= k;
  }
  return mix;
}
