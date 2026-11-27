/**
 * Timed power-ups from amber blocks: fire roar, ground pound, sword.
 * (The extra heart is instant — see health.heal.)
 */
import type { PowerUpKind } from "./level/legend.js";

export type TimedPower = Exclude<PowerUpKind, "heart">;
export const TIMED_POWERS: readonly TimedPower[] = ["fire", "pound", "sword"];

export const POWER = {
  durationMs: 20000,
  fireCooldownMs: 350,
  fireSpeed: 680,
  fireLifeMs: 900,
  swordReachMult: 1.9,
  swordDamage: 2,
} as const;

export interface Powers {
  /** Time left on each power (0 = not active). */
  timers: Record<TimedPower, number>;
  fireCooldownMs: number;
}

export function initialPowers(): Powers {
  return { timers: { fire: 0, pound: 0, sword: 0 }, fireCooldownMs: 0 };
}

export function grantPower(p: Powers, kind: PowerUpKind): Powers {
  if (kind === "heart") return p;
  return { ...p, timers: { ...p.timers, [kind]: POWER.durationMs } };
}

export function hasPower(p: Powers, kind: TimedPower): boolean {
  return p.timers[kind] > 0;
}

export function powerTimeLeft(p: Powers, kind: TimedPower): number {
  return p.timers[kind];
}

export function tickPowers(p: Powers, dtMs: number): Powers {
  const timers = { ...p.timers };
  for (const k of TIMED_POWERS) timers[k] = Math.max(0, timers[k] - dtMs);
  return { timers, fireCooldownMs: Math.max(0, p.fireCooldownMs - dtMs) };
}

/** Try to shoot a fireball. */
export function tryFire(p: Powers): { powers: Powers; fired: boolean } {
  if (!hasPower(p, "fire") || p.fireCooldownMs > 0) return { powers: p, fired: false };
  return { powers: { ...p, fireCooldownMs: POWER.fireCooldownMs }, fired: true };
}
