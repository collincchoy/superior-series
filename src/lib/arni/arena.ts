/** Rex's arena: from the gate (`|`) to the wall on Rex's (`K`) right. */
import { isEnemyKind } from "./combat.js";
import { isSolidTile } from "./level/collision.js";
import type { Level, Spawn, TilePos } from "./level/parseLevel.js";

export interface Arena {
  /** Column where the gate rises once the fight starts. */
  gateTx: number;
  /** First and last walkable columns inside the arena. */
  leftTx: number;
  rightTx: number;
  /** Row Arni and Rex stand in. */
  floorTy: number;
  rex: TilePos;
}

export function findArena(level: Level): Arena | null {
  const rex = level.spawns.find((s) => s.kind === "rex");
  if (!rex) return null;
  const gate = level.spawns.find((s) => s.kind === "gate" && s.ty === rex.ty && s.tx < rex.tx);
  if (!gate) throw new Error("Rex's arena needs a gate '|' on the same row, to Rex's left");
  let right = rex.tx;
  while (right + 1 < level.width && !isSolidTile(level, right + 1, rex.ty)) right++;
  return { gateTx: gate.tx, leftTx: gate.tx + 1, rightTx: right, floorTy: rex.ty, rex: { tx: rex.tx, ty: rex.ty } };
}

/** Minions placed inside the arena — Rex's throne guards in the final level. */
export function arenaGuards(level: Level, arena: Arena): Spawn[] {
  return level.spawns.filter((s) => isEnemyKind(s.kind) && s.tx >= arena.leftTx && s.tx <= arena.rightTx);
}
