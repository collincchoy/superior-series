/** Smashing, bonking and cracking open blocks. Pure: returns new Levels, never mutates. */
import type { Rect } from "./combat.js";
import { TILE_SIZE as T } from "./constants.js";
import { TILE_PROPS, type TileKind } from "./level/legend.js";
import type { Level } from "./level/parseLevel.js";

/** Coins that burst out of an amber block. */
export const AMBER_COINS = 3;

export interface TileHit {
  tx: number;
  ty: number;
  kind: TileKind;
}

export function tilesInRect(level: Level, r: Rect): TileHit[] {
  const out: TileHit[] = [];
  const tx0 = Math.max(0, Math.floor(r.left / T));
  const tx1 = Math.min(level.width - 1, Math.ceil(r.right / T) - 1);
  const ty0 = Math.max(0, Math.floor(r.top / T));
  const ty1 = Math.min(level.height - 1, Math.ceil(r.bottom / T) - 1);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const kind = level.tiles[ty][tx];
      if (kind) out.push({ tx, ty, kind });
    }
  }
  return out;
}

/** Blocks the tail whip affects: breakables smash, amber cracks open. */
export function whipTargets(level: Level, whip: Rect): TileHit[] {
  return tilesInRect(level, whip).filter((t) => TILE_PROPS[t.kind].breakable || t.kind === "amber");
}

export function withTile(level: Level, tx: number, ty: number, kind: TileKind | null): Level {
  const tiles = level.tiles.slice();
  tiles[ty] = tiles[ty].slice();
  tiles[ty][tx] = kind;
  return { ...level, tiles };
}

export function breakTile(level: Level, tx: number, ty: number): Level {
  const kind = level.tiles[ty]?.[tx];
  if (!kind || !TILE_PROPS[kind].breakable) return level;
  return withTile(level, tx, ty, null);
}

export interface AmberReward {
  coins: number;
}

export function hitAmber(level: Level, tx: number, ty: number): { level: Level; reward: AmberReward | null } {
  if (level.tiles[ty]?.[tx] !== "amber") return { level, reward: null };
  return { level: withTile(level, tx, ty, "spent"), reward: { coins: AMBER_COINS } };
}

/**
 * The block Arni's head bumps while rising (the one nearest Arni's center),
 * or null. `arni` is Arni's body rect; contact counts within a few pixels.
 */
export function bonkTile(level: Level, arni: Rect, vy: number): TileHit | null {
  if (vy >= 0) return null;
  const ty = Math.floor((arni.top - 4) / T);
  if (ty < 0 || ty >= level.height) return null;
  const cx = (arni.left + arni.right) / 2;
  let best: TileHit | null = null;
  let bestDist = Infinity;
  for (let tx = Math.floor(arni.left / T); tx <= Math.floor((arni.right - 1) / T); tx++) {
    const kind = level.tiles[ty]?.[tx];
    if (!kind || !TILE_PROPS[kind].solid) continue;
    const dist = Math.abs(tx * T + T / 2 - cx);
    if (dist < bestDist) {
      best = { tx, ty, kind };
      bestDist = dist;
    }
  }
  return best;
}
