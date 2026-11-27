/**
 * Moving stone slabs. The slab's top sits at the top of its spawn cell;
 * horizontal ones slide right `rangeTiles` and back, vertical ones rise and fall.
 */
import { TILE_SIZE as T } from "./constants.js";

export type PlatformKind = "platformH" | "platformV";

export const PLATFORM = {
  widthTiles: 2,
  heightPx: 28,
  rangeTiles: 3,
  periodMs: 4000,
} as const;

/** Offset from the spawn position at time t (smooth ease in/out at the ends). */
export function platformOffset(kind: PlatformKind, tMs: number): { dx: number; dy: number } {
  const s = (PLATFORM.rangeTiles * T * (1 - Math.cos((2 * Math.PI * tMs) / PLATFORM.periodMs))) / 2;
  return kind === "platformH" ? { dx: s, dy: 0 } : { dx: 0, dy: s === 0 ? 0 : -s };
}

/** Velocity (px/s) along the path at time t — the derivative of platformOffset. */
export function platformVelocity(kind: PlatformKind, tMs: number): { vx: number; vy: number } {
  const w = (2 * Math.PI) / PLATFORM.periodMs;
  const v = ((PLATFORM.rangeTiles * T * w * Math.sin(w * tMs)) / 2) * 1000;
  return kind === "platformH" ? { vx: v, vy: 0 } : { vx: 0, vy: -v };
}
