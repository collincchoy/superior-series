import type Phaser from "phaser";
import { ASSETS, powerUpTextureKey } from "../../assets.js";
import { overlaps, type Rect } from "../../combat.js";
import { TILE_SIZE } from "../../constants.js";
import type { PowerUpKind } from "../../level/legend.js";
import { spawnPoint } from "../../level/parseLevel.js";
import { centerX, centerY, type LevelContext } from "../context.js";

interface Pickup {
  kind: "coin" | "egg";
  img: Phaser.GameObjects.Image;
  rect: Rect;
  taken: boolean;
}

interface PowerPickup {
  kind: PowerUpKind;
  img: Phaser.GameObjects.Image;
  age: number;
  taken: boolean;
}

/** Bubbles drift toward Arni after popping out, so they're never stranded out of reach. */
const POWER_HOME_AFTER_MS = 450;
const POWER_HOME_SPEED = 460;

/** Coins, hidden eggs, and power-up bubbles released from amber. */
export class Pickups {
  private items: Pickup[] = [];
  private powers: PowerPickup[] = [];

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

  /** Pop a power-up bubble out of the top of a cracked amber block. */
  spawnPowerUp(kind: PowerUpKind, at: { x: number; y: number }): void {
    const { host: scene } = this.ctx;
    const img = scene.add.image(at.x, at.y, powerUpTextureKey(kind)).setDepth(14).setScale(0.3);
    scene.tweens.add({ targets: img, y: at.y - 40, scale: 1, duration: 350, ease: "Back.out" });
    scene.tweens.add({ targets: img, angle: { from: -8, to: 8 }, duration: 500, yoyo: true, repeat: -1 });
    this.powers.push({ kind, img, age: 0, taken: false });
    this.ctx.sparks(at.x, at.y, 14);
  }

  update(dtMs = 16): void {
    const arni = this.ctx.arniRect();
    for (const p of this.items) {
      if (p.taken || !overlaps(arni, p.rect)) continue;
      p.taken = true;
      const at = { x: p.img.x, y: p.img.y };
      this.ctx.host.tweens.killTweensOf(p.img);
      if (p.kind === "coin") this.ctx.addCoins(1, at);
      else this.ctx.collectEgg(at);
      this.vanish(p.img, p.kind === "egg" ? 1.8 : 1.3, p.kind === "egg" ? 700 : 300);
    }

    for (const p of this.powers) {
      if (p.taken) continue;
      p.age += dtMs;
      const r = { left: p.img.x - 26, right: p.img.x + 26, top: p.img.y - 26, bottom: p.img.y + 26 };
      if (overlaps(arni, r)) {
        p.taken = true;
        this.ctx.host.tweens.killTweensOf(p.img);
        this.ctx.collectPowerUp(p.kind, { x: p.img.x, y: p.img.y });
        this.vanish(p.img, 2, 400);
        continue;
      }
      if (p.age > POWER_HOME_AFTER_MS) {
        const dx = centerX(arni) - p.img.x;
        const dy = centerY(arni) - p.img.y;
        const d = Math.hypot(dx, dy) || 1;
        const step = Math.min(d, (POWER_HOME_SPEED * dtMs) / 1000);
        p.img.x += (dx / d) * step;
        p.img.y += (dy / d) * step;
      }
    }
    this.powers = this.powers.filter((p) => !p.taken);
  }

  private vanish(img: Phaser.GameObjects.Image, scale: number, duration: number): void {
    this.ctx.host.tweens.add({
      targets: img,
      y: img.y - 50,
      scale,
      alpha: 0,
      duration,
      ease: "Quad.out",
      onComplete: () => img.destroy(),
    });
  }
}
