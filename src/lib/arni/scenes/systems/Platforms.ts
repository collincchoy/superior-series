import type Phaser from "phaser";
import { TILE_SIZE } from "../../constants.js";
import { PLATFORM, platformOffset, platformVelocity, type PlatformKind } from "../../platforms.js";
import { landsOnMovingTop, type LevelContext } from "../context.js";

/** How strongly (per second) a slab is pulled back onto its path if it drifts. */
const CORRECTION = 4;

interface Slab {
  kind: PlatformKind;
  x0: number;
  y0: number;
  img: Phaser.GameObjects.Image;
  body: Phaser.Physics.Arcade.Body;
  /** Where the slab was after the previous frame's physics, and how far it moved this frame. */
  lastX: number;
  movedX: number;
}

export interface Ride {
  body: Phaser.Physics.Arcade.Body;
  /** Horizontal distance the slab moved this frame — the rider moves with it. */
  movedX: number;
}

const W = PLATFORM.widthTiles * TILE_SIZE;

/** Moving stone slabs Arni can ride (one-way: jump up through them). */
export class Platforms {
  private slabs: Slab[] = [];
  /** The slab Arni touched during this frame's physics, if any. */
  private touched: Slab | null = null;
  private lastRiding: Slab | null = null;
  private t = 0;

  constructor(private ctx: LevelContext) {
    const { host: scene } = ctx;
    for (const s of ctx.level.spawns) {
      if (s.kind !== "platformH" && s.kind !== "platformV") continue;
      const x0 = s.tx * TILE_SIZE;
      const y0 = s.ty * TILE_SIZE;
      const img = scene.add.image(x0, y0, "platform").setOrigin(0, 0).setDepth(5);
      const body = scene.physics.add.body(x0, y0, W, PLATFORM.heightPx);
      body.setAllowGravity(false).setImmovable(true);
      body.pushable = false;
      // We carry riders ourselves (see glue); Arcade's friction carry would double it.
      body.setFriction(0, 0);
      this.slabs.push({ kind: s.kind, x0, y0, img, body, lastX: x0, movedX: 0 });
    }
  }

  addArniCollider(): void {
    const { host: scene, arniBody } = this.ctx;
    for (const slab of this.slabs) {
      scene.physics.add.collider(
        arniBody,
        slab.body,
        () => {
          if (arniBody.touching.down) this.touched = slab;
        },
        () => landsOnMovingTop(arniBody, slab.body),
      );
    }
  }

  /**
   * Keep a rider glued to the slab they're standing on. Physics contact on a
   * moving surface flickers; once riding, Arni stays on top until jumping or
   * walking off the edge. Returns the ride (slab + how far it moved), if any.
   */
  glue(arni: Phaser.Physics.Arcade.Body, jumping: boolean): Ride | null {
    const cand = this.touched ?? this.lastRiding;
    this.touched = null;
    if (!cand || jumping) {
      this.lastRiding = null;
      return null;
    }
    const b = cand.body;
    const onX = arni.right > b.left + 4 && arni.left < b.right - 4;
    const gap = arni.bottom - b.top;
    this.lastRiding = onX && gap > -24 && gap < 14 ? cand : null;
    return this.lastRiding && { body: b, movedX: this.lastRiding.movedX };
  }

  /**
   * Steer each slab along its path with velocity: the path's true speed plus
   * a gentle pull back toward the path. Smooth even when physics runs a
   * varying number of substeps per frame.
   */
  update(dtMs: number): void {
    this.t += dtMs;
    for (const s of this.slabs) {
      const { dx, dy } = platformOffset(s.kind, this.t);
      const { vx, vy } = platformVelocity(s.kind, this.t);
      s.body.setVelocity(vx + (s.x0 + dx - s.body.x) * CORRECTION, vy + (s.y0 + dy - s.body.y) * CORRECTION);
    }
  }

  /** After physics: record how far each slab moved, and place its image. */
  syncViews(): void {
    for (const s of this.slabs) {
      s.movedX = s.body.x - s.lastX;
      s.lastX = s.body.x;
      s.img.setPosition(s.body.x, s.body.y);
    }
  }
}
