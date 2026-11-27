/** Arni's hearts. Losing all of them means a trip back to the last checkpoint — never game over. */
import { TUNING as T } from "./tuning.js";

export interface Health {
  hearts: number;
  maxHearts: number;
  /** Remaining invulnerability after a hit or respawn. */
  invulnMs: number;
}

export type DamageResult = "hurt" | "dead" | "ignored";

export function initialHealth(): Health {
  return { hearts: T.maxHearts, maxHearts: T.maxHearts, invulnMs: 0 };
}

export function isInvulnerable(h: Health): boolean {
  return h.invulnMs > 0;
}

export function damage(h: Health): { health: Health; result: DamageResult } {
  if (isInvulnerable(h) || h.hearts <= 0) return { health: h, result: "ignored" };
  const hearts = h.hearts - 1;
  return {
    health: { ...h, hearts, invulnMs: T.invulnMs },
    result: hearts === 0 ? "dead" : "hurt",
  };
}

export function tickHealth(h: Health, dtMs: number): Health {
  return h.invulnMs > 0 ? { ...h, invulnMs: Math.max(0, h.invulnMs - dtMs) } : h;
}

/** Extra-heart pickup: heal one, or at full health grant one golden bonus heart. */
export function heal(h: Health): Health {
  return { ...h, hearts: Math.min(h.maxHearts + 1, h.hearts + 1) };
}

export function hasBonusHeart(h: Health): boolean {
  return h.hearts > h.maxHearts;
}

export function respawnHealth(h: Health): Health {
  return { ...h, hearts: h.maxHearts, invulnMs: T.invulnMs };
}
