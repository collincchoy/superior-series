import Phaser from "phaser";
import { findArena, type Arena } from "../../arena.js";
import { withTile } from "../../blocks.js";
import { BOSS, bossHit, initialBoss, stepBoss, type BossEvent, type BossState } from "../../boss.js";
import { overlaps, resolveEnemyContact, type Rect } from "../../combat.js";
import { TILE_SIZE } from "../../constants.js";
import { spawnPoint, tileCenter } from "../../level/parseLevel.js";
import { bodyRect, centerX, type LevelContext } from "../context.js";
import type { Blocks } from "./Blocks.js";
import type { Enemies } from "./Enemies.js";

const GRAVITY = 1800;

export type BossContact = "stomp" | "bounce" | "none";

/**
 * Rex the Banana in the arena: a gate that rises behind Arni, the camera
 * locked to the arena, Rex's state machine driving a physics body, and the
 * rule that Rex can only be hurt while dizzy.
 */
export class Boss {
  readonly arena: Arena | null;
  private state: BossState = initialBoss();
  private started = false;
  private body?: Phaser.Physics.Arcade.Body;
  private view?: Phaser.GameObjects.Image;
  private gate: Phaser.GameObjects.Image[] = [];
  private gateBodies: Phaser.Physics.Arcade.StaticBody[] = [];
  private hitThisSwing = false;
  /** Called once Rex has been defeated and has flown off. */
  onDefeated: (() => void) | null = null;
  /** Called when the fight starts / Rex's hits change (for the HUD). */
  onHits: ((hitsLeft: number) => void) | null = null;
  /** Called when the fight starts (e.g. to move the respawn point inside the arena). */
  onStart: ((arena: Arena) => void) | null = null;

  constructor(
    private ctx: LevelContext,
    blocks: Blocks,
    private enemies: Enemies,
  ) {
    this.arena = findArena(ctx.level);
    const a = this.arena;
    if (!a) return;
    const { host: scene } = ctx;
    const { x, y } = spawnPoint(a.rex.tx, a.rex.ty);
    this.body = scene.physics.add.body(x - BOSS.width / 2, y - BOSS.height, BOSS.width, BOSS.height);
    this.body.setGravityY(GRAVITY).setMaxVelocityY(1200);
    blocks.addWalkerColliders(this.body);
    this.view = scene.add.image(x, y, "rex").setOrigin(0.5, 1).setDepth(8);
    scene.tweens.add({ targets: this.view, scaleY: 0.96, duration: 600, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    enemies.extraFireTarget = (r) => this.fireHit(r);

    // The gate: a column of carved blocks, hidden below the floor until the fight starts.
    for (let ty = 0; ty <= a.floorTy; ty++) {
      const c = tileCenter(a.gateTx, ty);
      const img = scene.add.image(c.x, c.y + TILE_SIZE * (a.floorTy + 1), "gate").setDepth(6).setVisible(false);
      this.gate.push(img);
    }
  }

  get active(): boolean {
    return this.started && this.state.mode !== "defeated";
  }

  get hitsLeft(): number {
    return this.state.hitsLeft;
  }

  // ── Per-frame ──────────────────────────────────────────────────

  update(dtMs: number): void {
    const a = this.arena;
    if (!a || !this.body || !this.view) return;
    const arni = this.ctx.arniRect();
    if (!this.started) {
      if (centerX(arni) > (a.leftTx + 1.5) * TILE_SIZE) this.start();
      else return;
    }
    if (this.state.mode === "defeated") return;

    const b = this.body;
    const facing = this.state.facing;
    const edgeLeft = a.leftTx * TILE_SIZE;
    const edgeRight = (a.rightTx + 1) * TILE_SIZE;
    const atWall = facing < 0 ? b.left <= edgeLeft + 6 || b.blocked.left : b.right >= edgeRight - 6 || b.blocked.right;
    const out = stepBoss(
      this.state,
      { arniDx: centerX(arni) - b.center.x, arniDy: arni.bottom - b.bottom, wallAhead: atWall, grounded: b.blocked.down },
      dtMs,
    );
    this.state = out.state;
    b.setVelocityX(out.vx);
    if (out.jump) b.setVelocityY(out.jump);
    for (const t of out.throws) {
      // Lob from Rex's raised hand toward Arni's middle.
      const hx = b.center.x + this.state.facing * 30;
      const hy = b.top + 20;
      // t.dx is relative to Rex (Arni's position plus a little spread).
      this.enemies.lobPeel(hx, hy, b.center.x + t.dx - hx, arni.top + 20 - hy);
    }
    for (let i = 0; i < out.summon; i++) {
      const sx = (a.leftTx + 2 + i * (a.rightTx - a.leftTx - 4)) * TILE_SIZE;
      this.enemies.summon("bunchling", sx, (a.floorTy + 1) * TILE_SIZE - TILE_SIZE * 3, i % 2 === 0 ? 1 : -1);
    }
    this.playEvents(out.events);
  }

  syncView(): void {
    if (!this.body || !this.view || this.state.mode === "defeated") return;
    this.view.setPosition(this.body.center.x, this.body.bottom);
    this.view.setFlipX(this.state.facing > 0);
    this.view.setTexture(this.state.mode === "dizzy" ? "rex-dizzy" : "rex");
  }

  private start(): void {
    const a = this.arena!;
    const { host: scene } = this.ctx;
    this.started = true;
    // Raise the gate and make it solid (in the grid too, for senses & standing checks).
    this.gate.forEach((img, i) => {
      const ty = i;
      const c = tileCenter(a.gateTx, ty);
      img.setVisible(true);
      scene.tweens.add({ targets: img, y: c.y, duration: 500, delay: (a.floorTy - ty) * 40, ease: "Back.out" });
      const body = scene.physics.add.staticBody(c.x - TILE_SIZE / 2, c.y - TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
      this.gateBodies.push(body);
      scene.physics.add.collider(this.ctx.arniBody, body);
      this.ctx.level = withTile(this.ctx.level, a.gateTx, ty, "ground");
    });
    scene.cameras.main.shake(300, 0.006);
    // Lock the camera to the arena.
    const cam = scene.cameras.main;
    cam.setBounds(a.gateTx * TILE_SIZE, 0, (a.rightTx - a.gateTx + 1) * TILE_SIZE, this.ctx.level.height * TILE_SIZE);
    this.onHits?.(this.state.hitsLeft);
    this.onStart?.(a);
  }

  // ── Contact with Arni ──────────────────────────────────────────

  newSwing(): void {
    this.hitThisSwing = false;
  }

  /** Resolve Arni vs Rex this frame. Stomping a non-dizzy Rex just bounces Arni off — no damage. */
  contact(whip: Rect | null, prevBottom: number): BossContact {
    if (!this.active || !this.body) return "none";
    const rex = this.rexRect();
    const result = resolveEnemyContact({
      arni: this.ctx.arniRect(),
      arniPrevBottom: prevBottom,
      arniVy: this.ctx.arniBody.velocity.y,
      whip: whip && !this.hitThisSwing ? whip : null,
      enemy: rex,
    });
    if (result === "whip") {
      this.hitThisSwing = true;
      this.tryHit();
      return "none";
    }
    if (result === "stomp") {
      const wasDizzy = this.state.mode === "dizzy";
      this.tryHit();
      return wasDizzy ? "stomp" : "bounce";
    }
    if (result === "hurt" && this.state.mode !== "dizzy" && this.state.mode !== "hurt" && this.state.mode !== "intro") {
      this.ctx.hurtArni((Math.sign(centerX(rex) - centerX(this.ctx.arniRect())) || 1) as -1 | 1);
    }
    return "none";
  }

  /** Ground-pound shockwave. */
  poundShock(x: number, feetY: number, radius: number): void {
    if (!this.active || !this.body) return;
    if (Math.abs(this.body.center.x - x) <= radius + BOSS.width / 2 && Math.abs(this.body.bottom - feetY) <= TILE_SIZE) {
      this.tryHit();
    }
  }

  private fireHit(r: Rect): boolean {
    if (!this.active || !this.body || !overlaps(r, this.rexRect())) return false;
    this.tryHit();
    return true;
  }

  /** A slightly slimmer box than the art, so hits feel fair. */
  private rexRect(): Rect {
    const r = bodyRect(this.body!);
    return { left: r.left + 10, right: r.right - 10, top: r.top + 12, bottom: r.bottom };
  }

  private tryHit(): void {
    const { state, result } = bossHit(this.state);
    const { host: scene } = this.ctx;
    const v = this.view!;
    if (result === "immune") {
      // Not dizzy: a cheeky "ha!" so kids learn to wait for the stars.
      if (this.state.mode !== "hurt" && this.state.mode !== "intro") this.say("Ha! Too slow!", "#ffd36a", 700);
      return;
    }
    this.state = state;
    this.onHits?.(state.hitsLeft);
    this.ctx.sparks(this.body!.center.x, this.body!.center.y, 30);
    scene.cameras.main.shake(200, 0.01);
    v.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    scene.time.delayedCall(120, () => v.clearTint().setTintMode(Phaser.TintModes.MULTIPLY));
    if (result === "hit") {
      this.say(state.hitsLeft === 2 ? "OUCH! My peel!" : "Grr! Get them, minions!", "#ff4f7b", 1200);
      return;
    }
    this.defeat();
  }

  private defeat(): void {
    const { host: scene } = this.ctx;
    const v = this.view!;
    const b = this.body!;
    b.enable = false;
    scene.tweens.killTweensOf(v);
    v.setTexture("rex-defeated").setScale(1);
    this.say("Nooo! My bananas!", "#fff6e0", 1600);
    scene.cameras.main.flash(400, 255, 246, 214);
    scene.tweens.add({ targets: v, y: v.y - 40, duration: 300, yoyo: true, ease: "Quad.out" });
    scene.tweens.add({
      targets: v,
      delay: 900,
      y: v.y - 900,
      angle: 720,
      scale: 0.3,
      duration: 1200,
      ease: "Quad.in",
      onComplete: () => this.onDefeated?.(),
    });
  }

  // ── Personality ────────────────────────────────────────────────

  private playEvents(events: BossEvent[]): void {
    const { host: scene } = this.ctx;
    const b = this.body!;
    for (const e of events) {
      switch (e) {
        case "taunt":
          this.say("Ha! You'll never catch me, dino!", "#ffd36a", 1500);
          break;
        case "charge":
          this.say("BANANA CHARGE!", "#ff7a2e", 700);
          this.ctx.dust(b.center.x, b.bottom, 10);
          break;
        case "slam":
          scene.cameras.main.shake(250, 0.012);
          this.ctx.dust(b.center.x + this.state.facing * 40, b.bottom - 40, 16);
          break;
        case "dizzy":
          scene.tweens.add({ targets: this.view, angle: { from: -8, to: 8 }, duration: 200, yoyo: true, repeat: 5, onComplete: () => this.view?.setAngle(0) });
          break;
        case "summon":
          this.say("Minions! ATTACK!", "#9be35a", 1200);
          break;
        default:
          break;
      }
    }
  }

  private say(text: string, color: string, ms: number): void {
    const { host: scene } = this.ctx;
    const b = this.body!;
    const t = scene.add
      .text(b.center.x, b.top - 16, text, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "28px",
        fontStyle: "bold",
        color,
        stroke: "#271f40",
        strokeThickness: 6,
      })
      .setOrigin(0.5, 1)
      .setDepth(25);
    scene.tweens.add({ targets: t, y: t.y - 30, alpha: 0, delay: ms * 0.6, duration: ms * 0.4, onComplete: () => t.destroy() });
  }
}
