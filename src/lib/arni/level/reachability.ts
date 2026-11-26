/**
 * Level-design lint: can Arni actually get to everything we placed?
 *
 * A deliberately simple model on the tile grid — it ignores walls between
 * two spots, so it can say "reachable" too generously, but it reliably
 * catches the common mistake of putting things too high or too far.
 * Numbers are derived from TUNING so retuning the jump re-checks levels.
 */
import { TILE_SIZE } from "../constants.js";
import { PLATFORM } from "../platforms.js";
import { bodyFor } from "../player.js";
import { TUNING as T } from "../tuning.js";
import { TILE_PROPS } from "./legend.js";
import type { Level } from "./parseLevel.js";

export interface JumpReach {
  /** Tiles Arni can climb with a normal jump. */
  rise: number;
  /** Tiles Arni can climb with a fully charged crouch jump. */
  chargedRise: number;
  /** Horizontal tiles covered in one level jump. */
  across: number;
  /** Rows above the standing row where a pickup can still be grabbed mid-jump. */
  grabRise: number;
  /** Rows above the standing row where a block can be bonked from below. */
  bonkRise: number;
  /** Tiles a bounce mushroom launches Arni. */
  springRise: number;
}

export function jumpReach(): JumpReach {
  const h = (v: number) => (v * v) / (2 * T.gravity);
  const jumpH = h(T.jumpVelocity);
  const tUp = T.jumpVelocity / T.gravity;
  const tDown = Math.sqrt((2 * jumpH) / (T.gravity * T.fallGravityMult));
  const reachH = jumpH + bodyFor("stand").height;
  return {
    rise: Math.floor(jumpH / TILE_SIZE),
    chargedRise: Math.floor(h(T.chargedJumpVelocity) / TILE_SIZE),
    across: Math.floor((T.runSpeed * (tUp + tDown)) / TILE_SIZE),
    grabRise: Math.floor(reachH / TILE_SIZE - 0.5),
    bonkRise: Math.floor(reachH / TILE_SIZE),
    springRise: Math.floor(h(T.springVelocity) / TILE_SIZE),
  };
}

/**
 * Cells Arni can stand in while riding a moving platform, anywhere along
 * its path. The slab's top is the top of its spawn cell, so riders stand
 * in the row above.
 */
function platformCells(level: Level): { tx: number; ty: number }[] {
  const cells: { tx: number; ty: number }[] = [];
  for (const s of level.spawns) {
    if (s.kind === "platformH") {
      for (let tx = s.tx; tx < s.tx + PLATFORM.widthTiles + PLATFORM.rangeTiles; tx++) cells.push({ tx, ty: s.ty - 1 });
    } else if (s.kind === "platformV") {
      for (let ty = s.ty - 1; ty >= s.ty - 1 - PLATFORM.rangeTiles; ty--)
        for (let tx = s.tx; tx < s.tx + PLATFORM.widthTiles; tx++) cells.push({ tx, ty });
    }
  }
  return cells.filter((c) => c.ty >= 0 && c.tx >= 0 && c.tx < level.width);
}

const key = (tx: number, ty: number) => `${tx},${ty}`;

/** An empty cell with something standable directly below. */
function isStandable(level: Level, tx: number, ty: number): boolean {
  if (ty < 0 || ty + 1 >= level.height) return false;
  if (level.tiles[ty][tx] !== null) return false;
  const below = level.tiles[ty + 1][tx];
  return below !== null && TILE_PROPS[below].standable;
}

/** Standable cells Arni can get to from the player start, as "tx,ty" keys. */
export function reachableCells(level: Level, reach: JumpReach): Set<string> {
  const spotMap = new Map<string, { tx: number; ty: number }>();
  for (let ty = 0; ty < level.height; ty++)
    for (let tx = 0; tx < level.width; tx++)
      if (isStandable(level, tx, ty)) spotMap.set(key(tx, ty), { tx, ty });
  for (const c of platformCells(level)) spotMap.set(key(c.tx, c.ty), c);
  const spots = [...spotMap.values()];

  const onSpring = (c: { tx: number; ty: number }) => level.tiles[c.ty + 1]?.[c.tx] === "bounce";

  const start = level.playerStart;
  const seen = new Set([key(start.tx, start.ty)]);
  const queue = [start];
  while (queue.length) {
    const a = queue.shift()!;
    const maxRise = onSpring(a) ? Math.max(reach.springRise, reach.chargedRise) : reach.chargedRise;
    for (const b of spots) {
      const k = key(b.tx, b.ty);
      if (seen.has(k)) continue;
      const dx = Math.abs(b.tx - a.tx);
      const rise = a.ty - b.ty;
      const ok =
        rise > 0
          ? rise <= maxRise && dx <= reach.across
          : dx <= reach.across - rise;
      if (ok) {
        seen.add(k);
        queue.push(b);
      }
    }
  }
  return seen;
}

export interface Unreachable {
  what: string;
  tx: number;
  ty: number;
}

/** Everything placed in the level that Arni can't get to. Empty = all good. */
export function unreachableThings(level: Level, reach: JumpReach): Unreachable[] {
  const cells = reachableCells(level, reach);
  const reachable = [...cells].map((k) => {
    const [tx, ty] = k.split(",").map(Number);
    return { tx, ty };
  });

  const grabbable = (tx: number, ty: number) =>
    reachable.some(
      (r) => Math.abs(r.tx - tx) <= 2 && r.ty - ty >= 0 && r.ty - ty <= reach.grabRise,
    );
  const bonkable = (tx: number, ty: number) =>
    reachable.some((r) => r.tx === tx && r.ty - ty >= 1 && r.ty - ty <= reach.bonkRise);

  const out: Unreachable[] = [];
  for (const s of level.spawns) {
    if (s.kind === "platformH" || s.kind === "platformV" || s.kind === "gate") continue; // gadgets, not goals
    const ok =
      s.kind === "coin" || !isStandable(level, s.tx, s.ty)
        ? grabbable(s.tx, s.ty)
        : cells.has(key(s.tx, s.ty));
    if (!ok) out.push({ what: s.kind, tx: s.tx, ty: s.ty });
  }
  level.tiles.forEach((row, ty) =>
    row.forEach((kind, tx) => {
      if (kind === "amber" && !bonkable(tx, ty)) out.push({ what: "amber", tx, ty });
    }),
  );
  return out.sort((a, b) => a.ty - b.ty || a.tx - b.tx);
}
