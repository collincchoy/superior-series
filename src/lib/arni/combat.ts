/** Hitboxes and who-hits-whom. Pure geometry; the scene supplies rects. */
import type { SpawnKind } from "./level/legend.js";
import { TUNING as T } from "./tuning.js";

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Strict overlap — rects that only share an edge don't count. */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Arni spins, so the tail sweeps both sides at mid-body height. */
export function whipHitbox(body: Rect): Rect {
  const h = body.bottom - body.top;
  return {
    left: body.left - T.whipReach,
    right: body.right + T.whipReach,
    top: body.top + h * 0.2,
    bottom: body.bottom - 4,
  };
}

export type ContactResult = "whip" | "stomp" | "hurt" | "none";

export interface ContactInput {
  arni: Rect;
  /** Arni's feet last frame — distinguishes landing on a head from walking into a side. */
  arniPrevBottom: number;
  arniVy: number;
  whip: Rect | null;
  enemy: Rect;
}

export function resolveEnemyContact(c: ContactInput): ContactResult {
  if (c.whip && overlaps(c.whip, c.enemy)) return "whip";
  if (!overlaps(c.arni, c.enemy)) return "none";
  if (c.arniVy > 0 && c.arniPrevBottom <= c.enemy.top + T.stompTolerance) return "stomp";
  return "hurt";
}

// ── Enemies ────────────────────────────────────────────────────────

export type EnemyKind = Extract<SpawnKind, "bunchling" | "peelback" | "bruiser" | "spotter" | "mush">;
export const ENEMY_KINDS: readonly EnemyKind[] = ["bunchling", "peelback", "bruiser", "spotter", "mush"];

export function isEnemyKind(kind: SpawnKind): kind is EnemyKind {
  return (ENEMY_KINDS as readonly string[]).includes(kind);
}

export interface Enemy {
  kind: EnemyKind;
  hp: number;
  defeated: boolean;
}

export function enemyMaxHp(kind: EnemyKind): number {
  return kind === "bruiser" ? 2 : 1;
}

export function newEnemy(kind: EnemyKind): Enemy {
  return { kind, hp: enemyMaxHp(kind), defeated: false };
}

export function damageEnemy(e: Enemy): Enemy {
  if (e.defeated) return e;
  const hp = Math.max(0, e.hp - 1);
  return { ...e, hp, defeated: hp === 0 };
}
