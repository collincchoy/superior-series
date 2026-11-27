import Phaser from "phaser";
import { ASSETS, spawnTextureKey, type AssetKey } from "../../assets.js";
import {
  damageEnemy,
  isEnemyKind,
  newEnemy,
  overlaps,
  resolveEnemyContact,
  type Enemy,
  type Rect,
} from "../../combat.js";
import { TILE_SIZE, VIEW_WIDTH } from "../../constants.js";
import {
  AI,
  aiOnHit,
  initialAi,
  lobVelocity,
  splitOnDefeat,
  stepAi,
  type AiEvent,
  type AiState,
  type Facing,
  type MinionKind,
} from "../../enemyAi.js";
import { groundAhead, rectHitsSolid, wallAhead } from "../../level/collision.js";
import { POWER } from "../../powerups.js";
import { spawnPoint } from "../../level/parseLevel.js";
import { bodyRect, centerX, type LevelContext } from "../context.js";
import { sound } from "../sound.js";
import type { Blocks } from "./Blocks.js";

const GRAVITY = 1800;
const PEEL_GRAVITY = 1500;
const PEEL_FLIGHT_MS = 950;
const PEEL_LIFE_MS = 4000;
const GOO_LIFE_MS = 5000;
const MAX_GOO = 40;

interface Minion {
  kind: MinionKind;
  ai: AiState;
  enemy: Enemy;
  body: Phaser.Physics.Arcade.Body;
  view: Phaser.GameObjects.Image;
  idle: Phaser.Tweens.Tween;
  active: boolean;
  gone: boolean;
}

interface Peel {
  img: Phaser.GameObjects.Image;
  body: Phaser.Physics.Arcade.Body;
  age: number;
  dead: boolean;
}

interface MagicShot {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  age: number;
  dead: boolean;
}

interface Fireball {
  img: Phaser.GameObjects.Image;
  dir: 1 | -1;
  age: number;
  dead: boolean;
}

interface Goo {
  img: Phaser.GameObjects.Image;
  rect: Rect;
  age: number;
}

export type ContactOutcome = "stomp" | "none";

function textureFor(kind: MinionKind): AssetKey {
  return kind === "miniMush" ? "banana-minimush" : spawnTextureKey(kind);
}

/** Rex's banana minions, their thrown peels, and their goo. */
export class Enemies {
  private minions: Minion[] = [];
  private peels: Peel[] = [];
  private goo: Goo[] = [];
  private fireballs: Fireball[] = [];
  private magic: MagicShot[] = [];
  /** Minions already hit by the current tail swing. */
  private swingHits = new Set<Minion>();

  constructor(
    private ctx: LevelContext,
    private blocks: Blocks,
  ) {
    for (const s of ctx.level.spawns) {
      if (!isEnemyKind(s.kind)) continue;
      const { x, y } = spawnPoint(s.tx, s.ty);
      this.spawn(s.kind, x, y, -1, false);
    }
  }

  get aliveCount(): number {
    return this.minions.filter((m) => !m.gone).length;
  }

  /** Minions still standing between x0 and x1 (e.g. Rex's throne guards, incl. mini mushes they split into). */
  aliveBetween(x0: number, x1: number): number {
    return this.minions.filter((m) => !m.gone && !m.enemy.defeated && m.body.center.x >= x0 && m.body.center.x <= x1).length;
  }

  private spawn(kind: MinionKind, x: number, feetY: number, facing: Facing, active: boolean): Minion {
    const { host: scene } = this.ctx;
    const tex = textureFor(kind);
    const a = ASSETS[tex];
    const w = a.width * 0.72;
    const h = a.height * 0.86;
    const body = scene.physics.add.body(x - w / 2, feetY - h, w, h);
    body.enable = active;
    if (kind === "crownie") {
      // Flying: hovers in place with no gravity and passes over terrain.
      body.setAllowGravity(false);
    } else {
      body.setGravityY(GRAVITY).setMaxVelocityY(1000);
      this.blocks.addWalkerColliders(body);
    }
    const view = scene.add.image(x, feetY, tex).setOrigin(0.5, 1).setDepth(8);
    const idle = scene.tweens.add({
      targets: view,
      scaleY: 0.92,
      scaleX: 1.06,
      duration: 340 + Math.random() * 200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
    const m: Minion = { kind, ai: initialAi(kind, facing), enemy: newEnemy(kind), body, view, idle, active, gone: false };
    this.minions.push(m);
    return m;
  }

  // ── Per-frame ──────────────────────────────────────────────────

  update(dtMs: number): void {
    const cam = this.ctx.host.cameras.main;
    const arni = this.ctx.arniRect();
    const level = this.ctx.level;

    for (const m of this.minions) {
      if (m.gone) continue;
      if (!m.active) {
        if (Math.abs(m.body.center.x - cam.midPoint.x) > VIEW_WIDTH) continue;
        m.active = true;
        m.body.enable = true;
      }
      if (m.enemy.defeated) continue;
      const b = m.body;
      const halfW = b.width / 2;
      const facing = m.ai.facing;
      const out = stepAi(
        m.ai,
        {
          grounded: b.blocked.down,
          wallAhead:
            wallAhead(level, b.center.x, b.bottom, b.height, facing, halfW) ||
            (facing < 0 ? b.blocked.left : b.blocked.right),
          groundAhead: groundAhead(level, b.center.x, b.bottom, facing, halfW),
          arniDx: centerX(arni) - b.center.x,
          arniDy: arni.bottom - b.bottom,
        },
        dtMs,
      );
      m.ai = out.state;
      b.setVelocityX(out.vx);
      if (out.throwAt) this.throwPeel(m, out.throwAt);
      if (out.fireAt) this.shootMagic(m, arni);
      if (out.dropGoo) this.dropGoo(b.center.x, b.bottom);
      this.playEvents(m, out.events);

      if (b.top > level.height * TILE_SIZE + 200) this.remove(m);
    }

    this.updatePeels(dtMs, arni);
    this.updateFireballs(dtMs);
    this.updateMagic(dtMs, arni);
    this.updateGoo(dtMs);
  }

  syncViews(): void {
    const now = this.ctx.host.time.now;
    for (const m of this.minions) {
      if (m.gone || m.enemy.defeated) continue;
      // Flying crowns bob gently in the air (view only — the body flies level).
      const bob = m.kind === "crownie" ? Math.sin(now / 280 + m.body.x * 0.01) * 8 : 0;
      m.view.setPosition(m.body.center.x, m.body.bottom + bob);
      m.view.setFlipX(m.ai.facing > 0);
    }
    for (const p of this.peels) p.img.setPosition(p.body.center.x, p.body.center.y);
  }

  // ── Crownie magic fireballs ────────────────────────────────────

  /** A straight, slow-ish magic shot from the crown toward Arni's middle. */
  private shootMagic(m: Minion, arni: Rect): void {
    const { host: scene } = this.ctx;
    const x = m.body.center.x;
    const y = m.body.center.y + 6;
    const dx = centerX(arni) - x;
    const dy = (arni.top + arni.bottom) / 2 - y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = AI.crownie.shotSpeed;
    const img = scene.add.image(x, y, "enemy-fire").setDepth(13).setScale(0.4);
    scene.tweens.add({ targets: img, scale: 1, duration: 150, ease: "Back.out" });
    scene.tweens.add({ targets: img, angle: 360, duration: 600, repeat: -1 });
    this.magic.push({ img, vx: (dx / len) * speed, vy: (dy / len) * speed, age: 0, dead: false });
    sound(scene).play("magicShot");
    scene.tweens.add({ targets: m.view, scaleX: 1.25, scaleY: 0.85, duration: 90, yoyo: true });
  }

  private updateMagic(dtMs: number, arni: Rect): void {
    for (const s of this.magic) {
      if (s.dead) continue;
      s.age += dtMs;
      s.img.x += (s.vx * dtMs) / 1000;
      s.img.y += (s.vy * dtMs) / 1000;
      const r = { left: s.img.x - 11, right: s.img.x + 11, top: s.img.y - 11, bottom: s.img.y + 11 };
      if (overlaps(r, arni)) {
        this.ctx.hurtArni((Math.sign(s.vx) * -1 || 1) as -1 | 1);
        this.killMagic(s);
      } else if (s.age > 4000 || rectHitsSolid(this.ctx.level, r.left, r.top, r.right, r.bottom)) {
        this.killMagic(s);
      }
    }
    this.magic = this.magic.filter((s) => !s.dead);
  }

  private killMagic(s: MagicShot): void {
    s.dead = true;
    this.ctx.sparks(s.img.x, s.img.y, 6);
    this.ctx.host.tweens.killTweensOf(s.img);
    s.img.destroy();
  }

  // ── Contact with Arni ──────────────────────────────────────────

  /** Call on each new tail swing so every minion can be hit once per swing. */
  newSwing(): void {
    this.swingHits.clear();
  }

  contact(whip: Rect | null, prevBottom: number, whipDamage = 1): ContactOutcome {
    const arni = this.ctx.arniRect();
    let outcome: ContactOutcome = "none";
    for (const m of this.minions) {
      if (m.gone || m.enemy.defeated || !m.active) continue;
      const enemyRect = bodyRect(m.body);
      const result = resolveEnemyContact({
        arni,
        arniPrevBottom: prevBottom,
        arniVy: this.ctx.arniBody.velocity.y,
        whip: whip && !this.swingHits.has(m) ? whip : null,
        enemy: enemyRect,
      });
      if (result === "whip") {
        this.swingHits.add(m);
        this.hit(m, "whip", whipDamage);
      } else if (result === "stomp" && outcome === "none") {
        this.hit(m, "stomp");
        outcome = "stomp";
      } else if (result === "hurt") {
        this.ctx.hurtArni((Math.sign(centerX(enemyRect) - centerX(arni)) || 1) as -1 | 1);
      }
    }
    if (whip) this.whipPeels(whip);
    return outcome;
  }

  /** Is Arni's footing in goo? */
  onGoo(arni: Rect): boolean {
    const feet = { left: arni.left + 6, right: arni.right - 6, top: arni.bottom - 6, bottom: arni.bottom + 4 };
    return this.goo.some((g) => overlaps(feet, g.rect));
  }

  private hit(m: Minion, how: "whip" | "stomp" | "fire" | "pound", amount = 1): void {
    const { host: scene } = this.ctx;
    m.enemy = damageEnemy(m.enemy, amount);
    sound(this.ctx.host).play(m.enemy.defeated ? "enemyDefeat" : "enemyHit");
    this.ctx.sparks(m.body.center.x, m.body.center.y, 10);
    scene.cameras.main.shake(70, 0.004);

    if (!m.enemy.defeated) {
      m.ai = aiOnHit(m.ai);
      m.view.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      scene.time.delayedCall(90, () => m.view.clearTint().setTintMode(Phaser.TintModes.MULTIPLY));
      scene.tweens.add({ targets: m.view, angle: { from: -16, to: 0 }, duration: 280, ease: "Back.out" });
      this.popText(m, "!!", "#ff4f7b");
      return;
    }

    m.idle.stop();
    m.body.enable = false;
    const v = m.view;
    if (m.kind === "crownie") {
      // A beaten crown tumbles out of the sky.
      scene.tweens.add({ targets: v, y: v.y + 260, angle: 400, alpha: 0, duration: 800, ease: "Quad.in", onComplete: () => this.remove(m) });
    } else if (how === "stomp") {
      scene.tweens.add({ targets: v, scaleY: 0.25, scaleX: 1.4, duration: 90, ease: "Quad.out" });
      scene.tweens.add({ targets: v, alpha: 0, delay: 350, duration: 250, onComplete: () => this.remove(m) });
    } else {
      const away = Math.sign(m.body.center.x - this.ctx.arniBody.center.x) || 1;
      scene.tweens.add({
        targets: v,
        x: v.x + away * 220,
        y: v.y - 160,
        angle: away * 540,
        alpha: 0,
        duration: 600,
        ease: "Quad.out",
        onComplete: () => this.remove(m),
      });
    }

    const kids = splitOnDefeat(m.kind);
    if (kids.length) {
      const x = m.body.center.x;
      const y = m.body.bottom;
      scene.time.delayedCall(200, () =>
        kids.forEach((k, i) => {
          const dir: Facing = i % 2 === 0 ? -1 : 1;
          const kid = this.spawn(k, x + dir * 12, y - 4, dir, true);
          kid.body.setVelocity(dir * 160, -420);
          this.ctx.sparks(x, y - 20, 6);
        }),
      );
    }
  }

  private remove(m: Minion): void {
    m.gone = true;
    m.body.enable = false;
    m.view.setVisible(false);
    m.idle.stop();
  }

  // ── Fire roar & ground pound ───────────────────────────────────

  shootFireball(x: number, y: number, dir: 1 | -1): void {
    const img = this.ctx.host.add.image(x + dir * 30, y, "fireball").setDepth(13).setFlipX(dir < 0);
    this.fireballs.push({ img, dir, age: 0, dead: false });
  }

  private updateFireballs(dtMs: number): void {
    for (const f of this.fireballs) {
      if (f.dead) continue;
      f.age += dtMs;
      f.img.x += (f.dir * POWER.fireSpeed * dtMs) / 1000;
      f.img.y += Math.sin(f.age / 60) * 0.8; // a little flicker-wobble
      const r = { left: f.img.x - 16, right: f.img.x + 16, top: f.img.y - 11, bottom: f.img.y + 11 };
      const hitMinion = this.minions.find((m) => !m.gone && !m.enemy.defeated && m.active && overlaps(r, bodyRect(m.body)));
      if (hitMinion) {
        this.hit(hitMinion, "fire");
        this.killFireball(f);
        continue;
      }
      if (this.extraFireTarget?.(r)) {
        this.killFireball(f);
        continue;
      }
      for (const p of this.peels) {
        if (!p.dead && overlaps(r, bodyRect(p.body))) this.killPeel(p);
      }
      const tx = Math.floor((f.img.x + f.dir * 14) / TILE_SIZE);
      const ty = Math.floor(f.img.y / TILE_SIZE);
      if (this.blocks.fireHit(tx, ty) || f.age > POWER.fireLifeMs) this.killFireball(f);
    }
    this.fireballs = this.fireballs.filter((f) => !f.dead);
  }

  private killFireball(f: Fireball): void {
    f.dead = true;
    this.ctx.sparks(f.img.x, f.img.y, 8);
    f.img.destroy();
  }

  /** Ground-pound shockwave: hits every grounded minion within the radius. */
  poundShock(x: number, feetY: number, radius: number): void {
    for (const m of this.minions) {
      if (m.gone || m.enemy.defeated || !m.active) continue;
      const near = Math.abs(m.body.center.x - x) <= radius && Math.abs(m.body.bottom - feetY) <= TILE_SIZE;
      if (near && m.body.blocked.down) this.hit(m, "pound");
    }
  }

  // ── Peels ──────────────────────────────────────────────────────

  private throwPeel(m: Minion, at: { dx: number; dy: number }): void {
    const y = m.body.top + 10;
    // `at` is relative to the thrower's feet; aim a bit above Arni's feet.
    this.lobPeel(m.body.center.x, y, at.dx, at.dy + (m.body.bottom - y) - 30);
    sound(this.ctx.host).play("peelThrow");
    this.ctx.host.tweens.add({ targets: m.view, scaleY: 1.2, duration: 90, yoyo: true });
  }

  /** Lob a peel from (x, y) so it lands at (x+dx, y+dy). Used by Spotters and Rex. */
  lobPeel(x: number, y: number, dx: number, dy: number): void {
    const { host: scene } = this.ctx;
    const body = scene.physics.add.body(x - 12, y - 10, 24, 20);
    body.setGravityY(PEEL_GRAVITY);
    const { vx, vy } = lobVelocity(dx, dy, PEEL_FLIGHT_MS, PEEL_GRAVITY);
    body.setVelocity(vx, vy);
    const img = scene.add.image(x, y, "peel").setDepth(9);
    scene.tweens.add({ targets: img, angle: 360 * Math.sign(vx || 1), duration: 500, repeat: -1 });
    this.peels.push({ img, body, age: 0, dead: false });
  }

  /** Bring a minion into play (Rex's Minion Call). */
  summon(kind: MinionKind, x: number, feetY: number, facing: Facing): void {
    const m = this.spawn(kind, x, feetY, facing, true);
    m.body.setVelocityY(-300);
    this.ctx.sparks(x, feetY - 30, 16);
  }

  /** Other things fireballs can hit (Rex). Return true if the fireball was used up. */
  extraFireTarget: ((r: Rect) => boolean) | null = null;

  private updatePeels(dtMs: number, arni: Rect): void {
    for (const p of this.peels) {
      if (p.dead) continue;
      p.age += dtMs;
      const r = bodyRect(p.body);
      if (overlaps(r, arni)) {
        this.ctx.hurtArni((Math.sign(p.body.velocity.x) * -1 || 1) as -1 | 1);
        this.killPeel(p);
      } else if (p.age > PEEL_LIFE_MS || (p.age > 120 && rectHitsSolid(this.ctx.level, r.left, r.top, r.right, r.bottom))) {
        this.killPeel(p);
      }
    }
    this.peels = this.peels.filter((p) => !p.dead);
  }

  private whipPeels(whip: Rect): void {
    for (const p of this.peels) {
      if (!p.dead && overlaps(whip, bodyRect(p.body))) {
        this.ctx.sparks(p.body.center.x, p.body.center.y, 8);
        this.killPeel(p);
      }
    }
    // The tail swats Crownie magic shots out of the air too.
    for (const s of this.magic) {
      const r = { left: s.img.x - 11, right: s.img.x + 11, top: s.img.y - 11, bottom: s.img.y + 11 };
      if (!s.dead && overlaps(whip, r)) this.killMagic(s);
    }
  }

  private killPeel(p: Peel): void {
    p.dead = true;
    p.body.enable = false;
    this.ctx.dust(p.body.center.x, p.body.center.y, 4);
    this.ctx.host.tweens.killTweensOf(p.img);
    p.img.destroy();
    this.ctx.host.physics.world.remove(p.body);
  }

  // ── Goo ────────────────────────────────────────────────────────

  private dropGoo(x: number, feetY: number): void {
    const img = this.ctx.host.add.image(x, feetY, "goo").setOrigin(0.5, 1).setDepth(4).setScale(0.4);
    this.ctx.host.tweens.add({ targets: img, scale: 1, duration: 200, ease: "Back.out" });
    this.goo.push({ img, age: 0, rect: { left: x - 26, right: x + 26, top: feetY - 12, bottom: feetY + 2 } });
    if (this.goo.length > MAX_GOO) this.goo.shift()?.img.destroy();
  }

  private updateGoo(dtMs: number): void {
    for (const g of this.goo) {
      g.age += dtMs;
      if (g.age > GOO_LIFE_MS - 800) g.img.setAlpha(Math.max(0, (GOO_LIFE_MS - g.age) / 800));
    }
    const expired = this.goo.filter((g) => g.age >= GOO_LIFE_MS);
    expired.forEach((g) => g.img.destroy());
    this.goo = this.goo.filter((g) => g.age < GOO_LIFE_MS);
  }

  // ── Little personality touches ─────────────────────────────────

  private playEvents(m: Minion, events: AiEvent[]): void {
    const { host: scene } = this.ctx;
    for (const e of events) {
      switch (e) {
        case "spotted":
          sound(scene).play("minionAlert");
          this.popText(m, "!", "#ffd36a");
          scene.tweens.add({ targets: m.view, scaleY: 1.25, duration: 120, yoyo: true });
          break;
        case "wake":
          this.popText(m, "!", "#ffd36a");
          break;
        case "aim":
          sound(scene).play("crownAim");
          // Telegraph: the crown glows red and shivers before it fires.
          m.view.setTint(0xff6b6b);
          scene.tweens.add({ targets: m.view, angle: { from: -8, to: 8 }, duration: 60, yoyo: true, repeat: 3, onComplete: () => m.view.setAngle(0) });
          this.popText(m, "!", "#ff7a7a");
          scene.time.delayedCall(AI.crownie.aimMs, () => m.view.clearTint());
          break;
        case "charge":
          this.ctx.dust(m.body.center.x, m.body.bottom, 6);
          break;
        case "dizzy":
          this.popText(m, "@_@", "#ffffff");
          scene.tweens.add({ targets: m.view, angle: { from: -12, to: 12 }, duration: 120, yoyo: true, repeat: 3, onComplete: () => m.view.setAngle(0) });
          break;
        case "sleep":
          this.popText(m, "z", "#a9c7ff");
          break;
        case "panic":
          scene.tweens.add({ targets: m.view, x: m.view.x + 3, duration: 40, yoyo: true, repeat: 4 });
          break;
        default:
          break;
      }
    }
  }

  private popText(m: Minion, text: string, color: string): void {
    const { host: scene } = this.ctx;
    const t = scene.add
      .text(m.body.center.x, m.body.top - 10, text, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "26px",
        fontStyle: "bold",
        color,
        stroke: "#271f40",
        strokeThickness: 5,
      })
      .setOrigin(0.5, 1)
      .setDepth(20);
    scene.tweens.add({ targets: t, y: t.y - 30, alpha: 0, duration: 800, ease: "Quad.out", onComplete: () => t.destroy() });
  }
}
