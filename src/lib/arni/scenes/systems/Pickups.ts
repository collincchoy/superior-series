import type Phaser from "phaser";
import { ASSETS } from "../../assets.js";
import { overlaps, type Rect } from "../../combat.js";
import { TILE_SIZE } from "../../constants.js";
import { spawnPoint } from "../../level/parseLevel.js";
import type { LevelContext } from "../context.js";

interface Pickup {
  kind: "coin" | "egg";
  img: Phaser.GameObjects.Image;
  rect: Rect;
  taken: boolean;
}

/** Coins and hidden eggs placed in the level. */
export class Pickups {
  private items: Pickup[] = [];

  constructor(private ctx: LevelContext) {
    const { host: scene } = ctx;
    for (const s of ctx.level.spawns) {
      if (s.kind !== "coin" && s.kind !== "egg") continue;
      const { x, y } = spawnPoint(s.tx, s.ty);
      const a = ASSETS[s.kind];
      if (s.kind === "coin") {
        const cy = y - TILE_SIZE / 2;
        const img = scene.add.image(x, cy, "coin").setOrigin(a.originX, a.originY);
        scene.tweens.add({ targets: img, y: cy - 6, duration: 700, yoyo: true, repeat: -1, ease: "Sine.inOut" });
        // Generous pickup box: a coin one row above the floor is grabbed just by walking past.
        this.items.push({ kind: "coin", img, taken: false, rect: { left: x - 24, right: x + 24, top: cy - 26, bottom: cy + 28 } });
      } else {
        const img = scene.add.image(x, y, "egg").setOrigin(a.originX, a.originY);
        scene.tweens.add({ targets: img, angle: { from: -6, to: 6 }, duration: 600, yoyo: true, repeat: -1, ease: "Sine.inOut" });
        this.items.push({ kind: "egg", img, taken: false, rect: { left: x - 22, right: x + 22, top: y - 52, bottom: y } });
      }
    }
  }

  update(): void {
    const arni = this.ctx.arniRect();
    for (const p of this.items) {
      if (p.taken || !overlaps(arni, p.rect)) continue;
      p.taken = true;
      const at = { x: p.img.x, y: p.img.y };
      this.ctx.host.tweens.killTweensOf(p.img);
      if (p.kind === "coin") this.ctx.addCoins(1, at);
      else this.ctx.collectEgg(at);
      this.ctx.host.tweens.add({
        targets: p.img,
        y: p.img.y - 50,
        scale: p.kind === "egg" ? 1.8 : 1.3,
        alpha: 0,
        duration: p.kind === "egg" ? 700 : 300,
        ease: "Quad.out",
        onComplete: () => p.img.setVisible(false),
      });
    }
  }
}
