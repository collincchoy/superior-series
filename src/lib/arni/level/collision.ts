import { TILE_SIZE } from "../constants.js";
import { TILE_PROPS } from "./legend.js";
import type { Level } from "./parseLevel.js";

/**
 * Does this tile block movement from every side?
 * Off the left/right edge counts as a wall; above/below the level is open.
 */
export function isSolidTile(level: Level, tx: number, ty: number): boolean {
  if (tx < 0 || tx >= level.width) return true;
  if (ty < 0 || ty >= level.height) return false;
  const kind = level.tiles[ty][tx];
  return kind !== null && TILE_PROPS[kind].solid;
}

/** Does the world-pixel rect overlap any solid tile? Touching edges don't count. */
export function rectHitsSolid(
  level: Level,
  left: number,
  top: number,
  right: number,
  bottom: number,
): boolean {
  const tx0 = Math.floor(left / TILE_SIZE);
  const tx1 = Math.ceil(right / TILE_SIZE) - 1;
  const ty0 = Math.floor(top / TILE_SIZE);
  const ty1 = Math.ceil(bottom / TILE_SIZE) - 1;
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (isSolidTile(level, tx, ty)) return true;
    }
  }
  return false;
}
