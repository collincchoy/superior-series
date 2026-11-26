import Phaser from "phaser";
import { ASSETS, spawnTextureKey, tileTextureKey, type AssetKey } from "../assets.js";
import {
  damageEnemy,
  isEnemyKind,
  newEnemy,
  overlaps,
  resolveEnemyContact,
  whipHitbox,
  type Enemy,
  type Rect,
} from "../combat.js";
import { TILE_SIZE, VIEW_HEIGHT, VIEW_WIDTH } from "../constants.js";
import { damage, initialHealth, isInvulnerable, respawnHealth, tickHealth, type Health } from "../health.js";
import { ACTIONS, emptyInput, inputFromPressed, KEYBOARD_BINDINGS, type PlayerInput } from "../input.js";
import { rectHitsSolid } from "../level/collision.js";
import { TILE_PROPS } from "../level/legend.js";
import { TEST_LEVEL } from "../level/levels/testLevel.js";
import {
  parseLevel,
  spawnPoint,
  tileCenter,
  tileVariant,
  type Level,
  type TilePos,
} from "../level/parseLevel.js";
import {
  applyBounce,
  applyHurt,
  bodyFor,
  initialPlayer,
  isWhipping,
  stepPlayer,
  type PlayerEvent,
  type PlayerState,
  type Pose,
} from "../player.js";
import { activateCheckpoint, initialProgress, respawnTile, type Progress } from "../progress.js";
import { TUNING } from "../tuning.js";
import { HUD_KEYS } from "./HudScene.js";

/** Max simulated frame time, so a hitch doesn't launch Arni through floors. */
const MAX_DT_MS = 50;
const LOOKAHEAD_X = 110;
const CHARGE_TINT = 0xfff27a;
const HURT_TINT = 0xff4f7b;
const RESPAWN_DELAY_MS = 900;

interface EnemyEntity {
  enemy: Enemy;
  img: Phaser.GameObjects.Image;
  rect: Rect;
  idle: Phaser.Tweens.Tween;
}

interface CheckpointEntity {
  pos: TilePos;
  img: Phaser.GameObjects.Image;
  rect: Rect;
}

/**
 * Thin Phaser adapter. Rules live in pure modules (player, health, combat,
 * progress, level/*); this scene builds the world, feeds input and contacts
 * in, and draws the results.
 *
 * Arni is two objects: an invisible physics Body (size changes with pose)
 * and a view Image that follows it — so squash/stretch never disturbs collisions.
 */
export class LevelScene extends Phaser.Scene {
  private level!: Level;
  private body!: Phaser.Physics.Arcade.Body;
  private view!: Phaser.GameObjects.Image;
  private bg!: Phaser.GameObjects.TileSprite;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private player: PlayerState = initialPlayer();
  private health: Health = initialHealth();
  private progress: Progress = initialProgress();
  private enemies: EnemyEntity[] = [];
  private checkpoints: CheckpointEntity[] = [];
  /** Enemies already hit by the current tail swing (one hit per swing). */
  private swingHits = new Set<EnemyEntity>();
  private dying = false;
  private hurtFlashUntil = 0;
  private lastBottom = 0;
  private keys = new Map<string, Phaser.Input.Keyboard.Key>();
  private lookahead = 0;

  constructor() {
    super("level");
  }

  create(): void {
    this.level = parseLevel(TEST_LEVEL);
    this.player = initialPlayer();
    this.health = initialHealth();
    this.progress = initialProgress();
    this.enemies = [];
    this.checkpoints = [];
    this.dying = false;
    // Per-run state must be reset here: scene.restart() reuses this instance,
    // and old Key objects die with the previous run's keyboard plugin.
    this.keys = new Map();
    this.swingHits = new Set();
    this.lookahead = 0;
    this.hurtFlashUntil = 0;
    const worldW = this.level.width * TILE_SIZE;
    const worldH = this.level.height * TILE_SIZE;

    this.physics.world.setBounds(0, 0, worldW, worldH + TILE_SIZE * 4);

    this.createBackground();
    const { solids, oneWays, hazards } = this.createTiles();
    this.createSpawns();
    this.createArni();
    this.createParticles();

    this.physics.add.collider(this.body, solids);
    this.physics.add.collider(this.body, oneWays, undefined, (_a, b) => this.landsOnOneWay(b));
    this.physics.add.collider(this.body, hazards, (_a, b) => this.touchHazard(b));

    const cam = this.cameras.main;
    cam.setBounds(0, 0, worldW, worldH);
    cam.startFollow(this.view, true, 0.12, 0.08);
    cam.setDeadzone(60, 140);

    this.bindKeyboard();
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncView, this);

    this.registry.set(HUD_KEYS.maxHearts, this.health.maxHearts);
    this.registry.set(HUD_KEYS.hearts, this.health.hearts);
    this.scene.launch("hud");
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, MAX_DT_MS);
    this.bg.tilePositionX = this.cameras.main.scrollX * 0.3;
    this.health = tickHealth(this.health, dt);
    this.updateArni(this.dying ? emptyInput() : this.readInput(), dt);
    if (!this.dying) {
      this.checkEnemies();
      this.checkCheckpoints();
    }
    this.updateCamera();
    this.lastBottom = this.body.bottom;
  }

  // ── Dev helpers (exposed via window.__arni in dev builds) ─────────

  debugState() {
    return {
      ...this.player,
      hearts: this.health.hearts,
      invulnMs: this.health.invulnMs,
      checkpoint: this.progress.checkpoint,
      enemiesLeft: this.enemies.filter((e) => !e.enemy.defeated).length,
      tx: Math.floor(this.body.center.x / TILE_SIZE),
      ty: Math.floor((this.body.bottom - 1) / TILE_SIZE),
    };
  }

  debugTeleport(tx: number, ty: number): void {
    this.placeArniAt({ tx, ty });
  }

  // ── World building ────────────────────────────────────────────────

  private createBackground(): void {
    this.add.image(0, 0, "bg-sky").setOrigin(0).setScrollFactor(0).setDisplaySize(VIEW_WIDTH, VIEW_HEIGHT);
    const jungle = ASSETS["bg-jungle"];
    this.bg = this.add
      .tileSprite(0, VIEW_HEIGHT, VIEW_WIDTH, jungle.height, "bg-jungle")
      .setOrigin(0, 1)
      .setScrollFactor(0);
  }

  private createTiles() {
    const solids = this.physics.add.staticGroup();
    const oneWays = this.physics.add.staticGroup();
    const hazards = this.physics.add.staticGroup();
    this.level.tiles.forEach((row, ty) =>
      row.forEach((kind, tx) => {
        if (!kind) return;
        const { x, y } = tileCenter(tx, ty);
        const key = tileTextureKey(kind, tileVariant(this.level, tx, ty));
        if (TILE_PROPS[kind].oneWay) {
          const plat = oneWays.create(x, y, key) as Phaser.Physics.Arcade.Sprite;
          // Only the top sliver of a branch is standable.
          (plat.body as Phaser.Physics.Arcade.StaticBody).setSize(TILE_SIZE, 20).setOffset(0, 2);
        } else if (kind === "thorns") {
          const t = hazards.create(x, y, key) as Phaser.Physics.Arcade.Sprite;
          // Hurt zone hugs the bramble, not the whole tile.
          (t.body as Phaser.Physics.Arcade.StaticBody).setSize(TILE_SIZE, 34).setOffset(0, 30);
        } else {
          solids.create(x, y, key);
        }
      }),
    );
    return { solids, oneWays, hazards };
  }

  /** Branches only catch Arni when falling onto them from above. */
  private landsOnOneWay(platform: unknown): boolean {
    const plat = platform as { body: Phaser.Physics.Arcade.StaticBody };
    const prevBottom = this.body.prev.y + this.body.height;
    return this.body.velocity.y >= 0 && prevBottom <= plat.body.top + 6;
  }

  private createSpawns(): void {
    for (const spawn of this.level.spawns) {
      const key = spawnTextureKey(spawn.kind);
      const { x, y } = spawnPoint(spawn.tx, spawn.ty);
      const img = this.placeImage(key, x, y);

      if (spawn.kind === "coin") {
        img.setY(y - TILE_SIZE / 2);
        this.tweens.add({ targets: img, y: img.y - 6, duration: 700, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      } else if (spawn.kind === "egg") {
        this.tweens.add({ targets: img, angle: { from: -6, to: 6 }, duration: 600, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      } else if (spawn.kind === "checkpoint") {
        this.checkpoints.push({ pos: { tx: spawn.tx, ty: spawn.ty }, img, rect: feetRect(x, y, 48, 112) });
      } else if (isEnemyKind(spawn.kind)) {
        // Banana minions stand still until AI arrives in Milestone 5.
        const a = ASSETS[key];
        const idle = this.tweens.add({
          targets: img,
          scaleY: 0.9,
          scaleX: 1.08,
          duration: 380 + Math.random() * 200,
          yoyo: true,
          repeat: -1,
          ease: "Sine.inOut",
        });
        this.enemies.push({
          enemy: newEnemy(spawn.kind),
          img,
          idle,
          rect: feetRect(x, y, a.width * 0.72, a.height * 0.86),
        });
      }
    }
  }

  private createArni(): void {
    const start = spawnPoint(this.level.playerStart.tx, this.level.playerStart.ty);
    const size = bodyFor("stand");
    this.body = this.physics.add.body(start.x - size.width / 2, start.y - size.height, size.width, size.height);
    this.body.setAllowGravity(false); // gravity is applied by stepPlayer
    const a = ASSETS["arni-idle"];
    this.view = this.add.image(start.x, start.y, "arni-idle").setOrigin(a.originX, a.originY).setDepth(10);
    this.lastBottom = this.body.bottom;
  }

  private createParticles(): void {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1).fillCircle(8, 8, 8);
    g.generateTexture("dust", 16, 16);
    g.destroy();
    this.dust = this.add.particles(0, 0, "dust", {
      lifespan: 350,
      speed: { min: 40, max: 140 },
      angle: { min: 200, max: 340 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 0.8, end: 0 },
      tint: 0xf3e2c0,
      emitting: false,
    });
    this.dust.setDepth(11);
    this.sparks = this.add.particles(0, 0, "dust", {
      lifespan: 450,
      speed: { min: 120, max: 320 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.6, end: 0 },
      tint: [0xffd36a, 0xff7a2e, 0xfff8d8, 0x3ef0d0],
      emitting: false,
    });
    this.sparks.setDepth(12);
  }

  private placeImage(key: AssetKey, x: number, y: number): Phaser.GameObjects.Image {
    const a = ASSETS[key];
    return this.add.image(x, y, key).setOrigin(a.originX, a.originY);
  }

  // ── Input ─────────────────────────────────────────────────────────

  private bindKeyboard(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    for (const action of ACTIONS) {
      for (const name of KEYBOARD_BINDINGS[action]) {
        if (!this.keys.has(name)) this.keys.set(name, kb.addKey(name));
      }
    }
  }

  private readInput(): PlayerInput {
    return inputFromPressed((name) => this.keys.get(name)?.isDown ?? false);
  }

  // ── Arni ──────────────────────────────────────────────────────────

  private arniRect(): Rect {
    const b = this.body;
    return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
  }

  private canStand(): boolean {
    const { width, height } = bodyFor("stand");
    const cx = this.body.center.x;
    const bottom = this.body.bottom;
    return !rectHitsSolid(this.level, cx - width / 2, bottom - height, cx + width / 2, bottom - 1);
  }

  private updateArni(input: PlayerInput, dtMs: number): void {
    const b = this.body;
    const prevPose = this.player.pose;
    const { state, events } = stepPlayer(
      this.player,
      input,
      {
        grounded: b.blocked.down || b.touching.down,
        canStand: this.canStand(),
        vx: b.velocity.x,
        vy: b.velocity.y,
      },
      dtMs,
    );
    this.player = state;
    if (state.pose !== prevPose) this.resizeBody(state.pose);
    b.setVelocity(state.vx, state.vy);

    if (!this.dying && b.top > this.level.height * TILE_SIZE + TILE_SIZE) this.fellOut();

    this.playEvents(events);
  }

  /** Change hitbox for a pose, keeping the feet where they are. */
  private resizeBody(pose: Pose): void {
    const b = this.body;
    const { width, height } = bodyFor(pose);
    const cx = b.center.x;
    const bottom = b.bottom;
    b.setSize(width, height, false);
    b.reset(cx - width / 2, bottom - height);
  }

  private placeArniAt(pos: TilePos): void {
    const { x, y } = spawnPoint(pos.tx, pos.ty);
    this.player = initialPlayer();
    this.resizeBody("stand");
    this.body.reset(x - this.body.width / 2, y - this.body.height);
    this.lastBottom = this.body.bottom;
  }

  // ── Combat & damage ───────────────────────────────────────────────

  private checkEnemies(): void {
    const arni = this.arniRect();
    const whip = isWhipping(this.player) ? whipHitbox(arni) : null;
    // Feet at the end of last frame (robust even if physics took several steps this frame).
    const prevBottom = this.lastBottom;

    for (const e of this.enemies) {
      if (e.enemy.defeated) continue;
      const result = resolveEnemyContact({
        arni,
        arniPrevBottom: prevBottom,
        arniVy: this.body.velocity.y,
        whip: whip && !this.swingHits.has(e) ? whip : null,
        enemy: e.rect,
      });
      if (result === "whip") {
        this.swingHits.add(e);
        this.hitEnemy(e, "whip");
      } else if (result === "stomp") {
        this.hitEnemy(e, "stomp");
        this.player = applyBounce(this.player, this.readInput().jump);
        this.body.setVelocityY(this.player.vy);
        this.squashView(0.8, 1.2);
      } else if (result === "hurt") {
        const dir = Math.sign(centerX(e.rect) - centerX(arni)) as -1 | 0 | 1;
        this.hurtArni(dir || 1);
      }
    }
  }

  private hitEnemy(e: EnemyEntity, how: "whip" | "stomp"): void {
    e.enemy = damageEnemy(e.enemy);
    const img = e.img;
    this.sparks.emitParticleAt(centerX(e.rect), (e.rect.top + e.rect.bottom) / 2, 10);
    this.cameras.main.shake(70, 0.004);

    if (!e.enemy.defeated) {
      // Tough minion survived: flash and wobble.
      img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      this.time.delayedCall(90, () => img.clearTint());
      this.tweens.add({ targets: img, angle: { from: -14, to: 0 }, duration: 260, ease: "Back.out" });
      return;
    }

    e.idle.stop();
    if (how === "stomp") {
      this.tweens.add({ targets: img, scaleY: 0.25, scaleX: 1.4, duration: 90, ease: "Quad.out" });
      this.tweens.add({ targets: img, alpha: 0, delay: 350, duration: 250, onComplete: () => img.setVisible(false) });
    } else {
      const away = Math.sign(centerX(e.rect) - this.body.center.x) || 1;
      this.tweens.add({
        targets: img,
        x: img.x + away * 220,
        y: img.y - 160,
        angle: away * 540,
        alpha: 0,
        duration: 600,
        ease: "Quad.out",
        onComplete: () => img.setVisible(false),
      });
    }
  }

  private touchHazard(tile: unknown): void {
    const t = tile as { body: Phaser.Physics.Arcade.StaticBody };
    const dx = t.body.center.x - this.body.center.x;
    const fromAbove = this.body.bottom <= t.body.top + 8;
    this.hurtArni(fromAbove ? 0 : (Math.sign(dx) as -1 | 1));
  }

  private hurtArni(fromDir: -1 | 0 | 1): void {
    if (this.dying) return;
    const { health, result } = damage(this.health);
    if (result === "ignored") return;
    this.health = health;
    this.registry.set(HUD_KEYS.hearts, health.hearts);
    if (result === "dead") {
      this.die();
      return;
    }
    this.player = applyHurt(this.player, fromDir);
    if (this.player.pose !== "stand" && this.canStand()) this.player.pose = "stand";
    this.resizeBody(this.player.pose);
    this.body.setVelocity(this.player.vx, this.player.vy);
    this.cameras.main.shake(120, 0.006);
    this.hurtFlashUntil = this.time.now + 140;
  }

  /** Falling out of the world costs a heart and returns Arni to the checkpoint. */
  private fellOut(): void {
    const { health, result } = damage({ ...this.health, invulnMs: 0 });
    this.health = health;
    this.registry.set(HUD_KEYS.hearts, health.hearts);
    if (result === "dead") {
      this.die();
    } else {
      this.respawn(false);
    }
  }

  private die(): void {
    this.dying = true;
    this.body.setVelocity(0, -500);
    this.player = { ...this.player, vy: -500, vx: 0 };
    this.tweens.add({ targets: this.view, angle: 720, alpha: 0, scale: 0.4, duration: RESPAWN_DELAY_MS * 0.8 });
    this.time.delayedCall(RESPAWN_DELAY_MS, () => this.respawn(true));
  }

  private respawn(refill: boolean): void {
    this.placeArniAt(respawnTile(this.level, this.progress));
    this.health = refill ? respawnHealth(this.health) : { ...this.health, invulnMs: TUNING.invulnMs };
    this.registry.set(HUD_KEYS.hearts, this.health.hearts);
    this.dying = false;
    this.tweens.killTweensOf(this.view);
    this.view.setAlpha(1).setScale(1).setAngle(0);
    this.tweens.add({ targets: this.view, scale: { from: 0.3, to: 1 }, duration: 300, ease: "Back.out" });
    this.cameras.main.flash(200, 255, 240, 200);
  }

  private checkCheckpoints(): void {
    const arni = this.arniRect();
    for (const c of this.checkpoints) {
      if (!overlaps(arni, c.rect)) continue;
      const { progress, activated } = activateCheckpoint(this.progress, c.pos);
      if (!activated) continue;
      this.progress = progress;
      for (const other of this.checkpoints) other.img.setTexture("checkpoint");
      c.img.setTexture("checkpoint-on");
      this.sparks.emitParticleAt(centerX(c.rect), c.rect.top + 20, 24);
      this.tweens.add({ targets: c.img, scaleY: { from: 1.25, to: 1 }, duration: 350, ease: "Back.out" });
    }
  }

  // ── Feedback ──────────────────────────────────────────────────────

  private squashView(sx: number, sy: number, ms = 90): void {
    this.tweens.killTweensOf(this.view);
    this.view.setScale(sx, sy);
    this.tweens.add({ targets: this.view, scaleX: 1, scaleY: 1, duration: ms * 2, ease: "Back.out" });
  }

  private playEvents(events: PlayerEvent[]): void {
    const puff = (n: number) => this.dust.emitParticleAt(this.body.center.x, this.body.bottom, n);
    for (const e of events) {
      switch (e) {
        case "jump":
          this.squashView(0.82, 1.2);
          puff(4);
          break;
        case "chargedJump":
          this.squashView(0.7, 1.35, 120);
          puff(10);
          this.cameras.main.shake(80, 0.003);
          break;
        case "land":
          this.squashView(1.25, 0.78);
          puff(5);
          break;
        case "slideStart":
          puff(6);
          break;
        case "chargeReady":
          this.squashView(1.12, 0.9, 60);
          break;
        case "whip":
          this.swingHits.clear();
          this.whipSwoosh();
          break;
        default:
          break;
      }
    }
  }

  private whipSwoosh(): void {
    const r = whipHitbox(this.arniRect());
    const ring = this.add
      .ellipse(centerX(r), (r.top + r.bottom) / 2, r.right - r.left, (r.bottom - r.top) * 0.9)
      .setStrokeStyle(9, 0xffd36a, 1)
      .setDepth(9);
    ring.isFilled = false;
    this.tweens.add({
      targets: ring,
      scaleX: 1.15,
      scaleY: 1.1,
      alpha: 0,
      duration: TUNING.whipMs + 80,
      onComplete: () => ring.destroy(),
    });
  }

  /** Runs after physics so the view sits exactly on the body. */
  private syncView(): void {
    const p = this.player;
    const v = this.view;
    v.setPosition(this.body.center.x, this.body.bottom);
    if (this.dying) return;
    v.setFlipX(p.facing < 0);
    v.setTexture(p.pose === "stand" ? "arni-idle" : "arni-crouch");

    if (isWhipping(p)) {
      // Spin attack: one full turn over the whip.
      v.setAngle((1 - p.attackMs / TUNING.whipMs) * 360 * p.facing);
    } else {
      const lean = p.pose === "slide" ? 10 * p.facing : (p.vx / TUNING.runSpeed) * 4;
      v.setAngle(lean);
    }

    // Blink while invulnerable; red flash when hit; glow while a charged jump is ready.
    const now = this.time.now;
    v.setAlpha(isInvulnerable(this.health) && Math.floor(now / 80) % 2 === 0 ? 0.35 : 1);
    if (now < this.hurtFlashUntil) {
      v.setTint(HURT_TINT).setTintMode(Phaser.TintModes.FILL);
    } else if (p.chargeMs >= TUNING.chargeMinMs && Math.floor(now / 90) % 2 === 0) {
      v.setTint(CHARGE_TINT).setTintMode(Phaser.TintModes.MULTIPLY);
    } else {
      v.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    }
  }

  private updateCamera(): void {
    const p = this.player;
    const target = Math.abs(p.vx) > 40 ? p.facing * LOOKAHEAD_X : this.lookahead;
    this.lookahead += (target - this.lookahead) * 0.04;
    this.cameras.main.setFollowOffset(-this.lookahead, 40);
  }
}

function feetRect(x: number, bottom: number, w: number, h: number): Rect {
  return { left: x - w / 2, right: x + w / 2, top: bottom - h, bottom };
}

function centerX(r: Rect): number {
  return (r.left + r.right) / 2;
}
