import type Phaser from "phaser";
import type { Rect } from "../combat.js";
import type { PowerUpKind } from "../level/legend.js";
import type { Level } from "../level/parseLevel.js";
import type { PlayerState } from "../player.js";

/**
 * What the level's systems (blocks, pickups, platforms, enemies) can see
 * and do. LevelScene implements it; systems never reach into each other.
 */
export interface LevelContext {
  host: Phaser.Scene;
  /** Current level grid — replaced (not mutated) when tiles change. */
  level: Level;
  arniBody: Phaser.Physics.Arcade.Body;
  arniRect(): Rect;
  player: PlayerState;
  jumpHeld(): boolean;
  hurtArni(fromDir: -1 | 0 | 1): void;
  addCoins(n: number, at: { x: number; y: number }): void;
  collectEgg(at: { x: number; y: number }): void;
  /** An amber block cracked open with a power-up inside: pop it out. */
  releasePowerUp(kind: PowerUpKind, at: { x: number; y: number }): void;
  /** Arni touched a power-up pickup. */
  collectPowerUp(kind: PowerUpKind, at: { x: number; y: number }): void;
  sparks(x: number, y: number, n: number): void;
  dust(x: number, y: number, n: number): void;
}

export const centerX = (r: Rect): number => (r.left + r.right) / 2;
export const centerY = (r: Rect): number => (r.top + r.bottom) / 2;

export function bodyRect(b: Phaser.Physics.Arcade.Body): Rect {
  return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
}

/** One-way rule for branches: only catch things falling onto the top. */
export function landsOnTop(mover: Phaser.Physics.Arcade.Body, platformTop: number): boolean {
  const prevBottom = mover.prev.y + mover.height;
  return mover.velocity.y >= 0 && prevBottom <= platformTop + 6;
}

/**
 * One-way rule for moving slabs, measured relative to the slab: a rider
 * moving up *with* a rising slab is still on top of it.
 */
export function landsOnMovingTop(mover: Phaser.Physics.Arcade.Body, slab: Phaser.Physics.Arcade.Body): boolean {
  const prevBottom = mover.prev.y + mover.height;
  return mover.velocity.y - slab.velocity.y >= -1 && prevBottom <= slab.prev.y + 8;
}
