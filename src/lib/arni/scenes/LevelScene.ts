import Phaser from "phaser";
import { ASSETS, themed, type Theme } from "../assets.js";
import { overlaps, whipHitbox, type Rect } from "../combat.js";
import { TILE_SIZE, VIEW_HEIGHT, VIEW_WIDTH } from "../constants.js";
import { damage, heal, initialHealth, isInvulnerable, respawnHealth, tickHealth, type Health } from "../health.js";
import { ACTIONS, emptyInput, inputFromPressed, KEYBOARD_BINDINGS, type PlayerInput } from "../input.js";
import { logicDeltaMs } from "../frameTiming.js";
import { rectHitsSolid } from "../level/collision.js";
import type { PowerUpKind } from "../level/legend.js";
import {
  grantPower,
  hasPower,
  initialPowers,
  POWER,
  tickPowers,
  tryFire,
  type Powers,
  type TimedPower,
} from "../powerups.js";
import { LEVELS, type LevelDef } from "../level/levels/index.js";
import { TEST_LEVEL } from "../level/levels/testLevel.js";
import { loadSave, recordWin, storeSave } from "../save.js";
import { parseLevel, spawnPoint, type Level, type TilePos } from "../level/parseLevel.js";
import { addCoins, collectEgg, initialScore, type Score } from "../pickups.js";
import {
  applyBounce,
  applyHurt,
  applySpring,
  bodyFor,
  initialPlayer,
  isWhipping,
  stepPlayer,
  type PlayerEvent,
  type PlayerState,
  type Pose,
} from "../player.js";
import { activateCheckpoint, initialProgress, respawnTile, type Progress } from "../progress.js";
import { COIN_TROPHY, trophies } from "../victory.js";
import type { VictoryData } from "./VictoryScene.js";
import { songForLevel } from "../audio/music.js";
import { TUNING } from "../tuning.js";
import { bodyRect, centerX, type LevelContext } from "./context.js";
import { HUD_EVENTS, HUD_KEYS } from "./HudScene.js";
import { sound } from "./sound.js";
import { Blocks } from "./systems/Blocks.js";
import { Boss } from "./systems/Boss.js";
import { Enemies } from "./systems/Enemies.js";
import { Pickups } from "./systems/Pickups.js";
import { Platforms } from "./systems/Platforms.js";

const LOOKAHEAD_X = 110;
const CHARGE_TINT = 0xfff27a;
const HURT_TINT = 0xff4f7b;
const RESPAWN_DELAY_MS = 900;

/** Shown when a power-up is picked up — names it and teaches the button. */
const POWER_UP_LABELS: Record<PowerUpKind, string> = {
  heart: "Extra Heart!",
  fire: "Fire Roar!\nPress K to roar",
  pound: "Ground Pound!\nPress ↓ in the air",
  sword: "Sword!\nX swings it",
};

interface CheckpointEntity {
  pos: TilePos;
  img: Phaser.GameObjects.Image;
  rect: Rect;
}

/**
 * Coordinates one play-through of a level. Rules live in pure modules
 * (player, health, combat, enemyAi, blocks, …); world pieces live in
 * systems (Blocks, Pickups, Platforms, Enemies) that share a LevelContext.
 *
 * Arni is two objects: an invisible physics Body (size changes with pose)
 * and a view Image that follows it — so squash/stretch never disturbs collisions.
 */
/** Passed to scene.start("level", …). */
export interface LevelStartData {
  /** Index into LEVELS; -1 = the sandbox test level (dev). */
  levelIndex?: number;
}

export class LevelScene extends Phaser.Scene implements LevelContext {
  level!: Level;
  theme: Theme = "volcano";
  private levelIndex = 0;
  player: PlayerState = initialPlayer();
  private body!: Phaser.Physics.Arcade.Body;
  private view!: Phaser.GameObjects.Image;
  private bg!: Phaser.GameObjects.TileSprite;
  private dustFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparkFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private health: Health = initialHealth();
  private powers: Powers = initialPowers();
  /** Shared with the HUD (read every frame), so it's mutated in place. */
  private hudPowers: Record<TimedPower, number> = { fire: 0, pound: 0, sword: 0 };
  private specialHeld = false;
  private swordView!: Phaser.GameObjects.Image;
  private progress: Progress = initialProgress();
  private score!: Score;
  private checkpoints: CheckpointEntity[] = [];
  private blocks!: Blocks;
  private pickups!: Pickups;
  private platforms!: Platforms;
  private enemies!: Enemies;
  private boss!: Boss;
  private won = false;
  private startedAt = 0;
  private dying = false;
  private hurtFlashUntil = 0;
  private lastBottom = 0;
  private lastSetVy = 0;
  private keys = new Map<string, Phaser.Input.Keyboard.Key>();
  private lookahead = 0;

  constructor() {
    super("level");
  }

  // ── LevelContext ──────────────────────────────────────────────────

  get host(): Phaser.Scene {
    return this;
  }

  get arniBody(): Phaser.Physics.Arcade.Body {
    return this.body;
  }

  arniRect(): Rect {
    return bodyRect(this.body);
  }

  jumpHeld(): boolean {
    return this.readInput().jump;
  }

  sparks(x: number, y: number, n: number): void {
    this.sparkFx.emitParticleAt(x, y, n);
  }

  dust(x: number, y: number, n: number): void {
    this.dustFx.emitParticleAt(x, y, n);
  }

  addCoins(n: number, at: { x: number; y: number }): void {
    sound(this).play("coin");
    this.score = addCoins(this.score, n);
    this.registry.set(HUD_KEYS.coins, this.score.coins);
    for (let i = 0; i < Math.min(n, 5); i++) {
      const c = this.add.image(at.x, at.y, "coin").setDepth(15);
      this.tweens.add({
        targets: c,
        x: at.x + (i - (n - 1) / 2) * 26,
        y: at.y - 70 - i * 6,
        alpha: 0,
        scale: 1.3,
        duration: 500,
        delay: i * 60,
        ease: "Quad.out",
        onComplete: () => c.destroy(),
      });
    }
    this.sparks(at.x, at.y, 3 + n);
  }

  collectEgg(at: { x: number; y: number }): void {
    sound(this).play("egg");
    this.score = collectEgg(this.score);
    this.registry.set(HUD_KEYS.eggs, this.score.eggs);
    this.sparks(at.x, at.y - 20, 30);
    this.cameras.main.flash(250, 255, 246, 214);
    const t = this.add
      .text(at.x, at.y - 70, `Egg found! ${this.score.eggs}/${this.score.eggsTotal}`, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "30px",
        fontStyle: "bold",
        color: "#fff6e0",
        stroke: "#d68a1f",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: t, y: t.y - 50, alpha: 0, delay: 700, duration: 700, onComplete: () => t.destroy() });
  }

  releasePowerUp(kind: PowerUpKind, at: { x: number; y: number }): void {
    this.pickups.spawnPowerUp(kind, at);
  }

  collectPowerUp(kind: PowerUpKind, at: { x: number; y: number }): void {
    sound(this).play(kind === "heart" ? "heal" : "powerUp");
    if (kind === "heart") {
      this.health = heal(this.health);
      this.registry.set(HUD_KEYS.hearts, this.health.hearts);
    } else {
      this.powers = grantPower(this.powers, kind);
    }
    this.sparks(at.x, at.y, 24);
    this.cameras.main.flash(180, 255, 246, 214);
    this.squashView(1.3, 0.8, 120);
    this.banner(POWER_UP_LABELS[kind], at);
  }

  /** Big friendly text that names a pickup and teaches its button. */
  private banner(text: string, at: { x: number; y: number }): void {
    const t = this.add
      .text(at.x, at.y - 60, text, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "30px",
        fontStyle: "bold",
        color: "#fff6e0",
        stroke: "#271f40",
        strokeThickness: 7,
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: t, y: t.y - 50, alpha: 0, delay: 1300, duration: 700, onComplete: () => t.destroy() });
  }

  /** "Level 3 · Thorny Trail" across the screen at the start. */
  private levelBanner(def: LevelDef): void {
    const style = { fontFamily: "system-ui, sans-serif", fontStyle: "bold", stroke: "#271f40", align: "center" };
    const top = this.add
      .text(VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - 50, `Level ${def.number}`, { ...style, fontSize: "36px", color: "#ffd36a", strokeThickness: 7 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(40);
    const name = this.add
      .text(VIEW_WIDTH / 2, VIEW_HEIGHT / 2 + 4, def.name, { ...style, fontSize: "60px", color: "#ffffff", strokeThickness: 10 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(40);
    for (const [i, t] of [top, name].entries()) {
      t.setAlpha(0).setScale(0.7);
      this.tweens.add({ targets: t, alpha: 1, scale: 1, delay: i * 120, duration: 350, ease: "Back.out" });
      this.tweens.add({ targets: t, alpha: 0, y: t.y - 30, delay: 1800 + i * 80, duration: 500, onComplete: () => t.destroy() });
    }
  }

  private tryFireRoar(input: PlayerInput): void {
    if (!input.special || this.specialHeld) return;
    const { powers, fired } = tryFire(this.powers);
    this.powers = powers;
    if (!fired) return;
    const p = this.player;
    const y = p.pose === "stand" ? this.body.top + 22 : this.body.top + 14;
    this.enemies.shootFireball(this.body.center.x, y, p.facing);
    sound(this).play("fireball");
    this.squashView(1.15, 0.92, 60);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  create(data: LevelStartData = {}): void {
    // -1 = the sandbox test level (dev only); otherwise an index into LEVELS.
    this.levelIndex = data.levelIndex ?? 0;
    const def = this.levelIndex >= 0 ? LEVELS[this.levelIndex] : undefined;
    this.theme = def?.theme ?? "volcano";
    this.level = parseLevel(def?.rows ?? TEST_LEVEL);
    this.player = initialPlayer();
    this.health = initialHealth();
    this.powers = initialPowers();
    this.hudPowers = { fire: 0, pound: 0, sword: 0 };
    this.specialHeld = false;
    this.progress = initialProgress();
    this.score = initialScore(this.level);
    this.checkpoints = [];
    this.dying = false;
    // Per-run state must be reset here: scene.restart() reuses this instance,
    // and old Key objects die with the previous run's keyboard plugin.
    this.keys = new Map();
    this.lookahead = 0;
    this.hurtFlashUntil = 0;
    this.won = false;
    this.startedAt = this.time.now;

    const worldW = this.level.width * TILE_SIZE;
    const worldH = this.level.height * TILE_SIZE;
    this.physics.world.setBounds(0, 0, worldW, worldH + TILE_SIZE * 4);

    this.createBackground();
    this.createArni();
    this.createParticles();
    this.blocks = new Blocks(this);
    this.pickups = new Pickups(this);
    this.platforms = new Platforms(this);
    this.enemies = new Enemies(this, this.blocks);
    this.boss = new Boss(this, this.blocks, this.enemies, def?.difficulty ?? 3, def?.rexOnThrone ?? false);
    this.boss.onHits = (n) => {
      this.registry.set(HUD_KEYS.bossMaxHits, this.boss.maxHits);
      this.registry.set(HUD_KEYS.bossHits, n);
    };
    this.boss.onStart = (arena) => {
      // Respawn inside the arena once the gate has closed.
      this.progress = activateCheckpoint(this.progress, { tx: arena.leftTx, ty: arena.floorTy }).progress;
    };
    this.boss.onDefeated = () => this.win();
    this.createCheckpoints();

    this.blocks.addArniColliders((tile) => this.touchHazard(tile.body, (tile.getData("tile") as { kind: string }).kind));
    this.platforms.addArniCollider();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, worldW, worldH);
    cam.startFollow(this.view, true, 0.12, 0.08);
    cam.setDeadzone(60, 140);

    this.bindKeyboard();
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncViews, this);

    // Pause: HUD button, Esc/P, or the window losing focus.
    const pause = () => this.openPause();
    this.game.events.on(HUD_EVENTS.pause, pause);
    this.game.events.on(Phaser.Core.Events.BLUR, pause);
    // The scene instance (and its emitters) survive restarts, so every
    // listener added in create() must be removed on shutdown.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(HUD_EVENTS.pause, pause);
      this.game.events.off(Phaser.Core.Events.BLUR, pause);
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncViews, this);
      this.input.keyboard?.off("keydown-ESC");
      this.input.keyboard?.off("keydown-P");
    });

    if (def) this.levelBanner(def);
    sound(this).playMusic(songForLevel(this.theme));
    sound(this).duck(false);

    this.registry.set(HUD_KEYS.maxHearts, this.health.maxHearts);
    this.registry.set(HUD_KEYS.hearts, this.health.hearts);
    this.registry.set(HUD_KEYS.coins, 0);
    this.registry.set(HUD_KEYS.eggs, 0);
    this.registry.set(HUD_KEYS.eggsTotal, this.score.eggsTotal);
    this.registry.set(HUD_KEYS.powers, this.hudPowers);
    this.registry.set(HUD_KEYS.bossHits, -1); // hidden until the fight starts
    this.scene.launch("hud");
  }

  update(): void {
    this.bg.tilePositionX = this.cameras.main.scrollX * 0.3;
    // Lockstep with physics: on frames without a physics step, contact flags
    // are stale (they cancelled jumps and re-triggered the mushroom). See frameTiming.ts.
    const dt = logicDeltaMs(this.physics.world.stepsLastFrame, this.physics.world.fps);
    if (dt === 0) {
      this.updateCamera();
      return;
    }
    this.health = tickHealth(this.health, dt);
    this.powers = tickPowers(this.powers, dt);
    Object.assign(this.hudPowers, this.powers.timers);

    const input = this.dying ? emptyInput() : this.readInput();
    this.platforms.update(dt);
    this.updateArni(input, dt);
    this.enemies.update(dt);
    this.boss.update(dt);

    if (!this.dying) {
      this.tryFireRoar(input);
      const sword = hasPower(this.powers, "sword");
      const whip = isWhipping(this.player) ? whipHitbox(this.arniRect(), sword ? POWER.swordReachMult : 1) : null;
      if (whip) this.blocks.whip(whip);
      const enemyHit = this.enemies.contact(whip, this.lastBottom, sword ? POWER.swordDamage : 1);
      const bossHit = this.boss.contact(whip, this.lastBottom);
      if (enemyHit === "stomp" || bossHit !== "none") {
        sound(this).play("stomp");
        this.player = applyBounce(this.player, this.jumpHeld());
        this.body.setVelocityY(this.player.vy);
        this.squashView(0.8, 1.2);
      }
      this.pickups.update(dt);
      this.checkCheckpoints();
    }
    this.specialHeld = input.special;

    this.updateCamera();
    this.lastBottom = this.body.bottom;
  }

  // ── Pause menu hooks ──────────────────────────────────────────────

  /** Rex is beaten: freeze the level and show the victory screen. */
  private win(): void {
    if (this.won) return;
    this.won = true;
    const earned = trophies(this.score, COIN_TROPHY);
    if (this.levelIndex >= 0) {
      const save = recordWin(loadSave(localStorage, LEVELS.length), this.levelIndex, {
        eggs: this.score.eggs,
        coins: this.score.coins,
        trophies: earned,
      });
      storeSave(localStorage, save);
    }
    const data: VictoryData = {
      score: { ...this.score },
      timeMs: this.time.now - this.startedAt,
      trophies: earned,
      levelIndex: this.levelIndex,
    };
    this.scene.pause();
    sound(this).stopMusic();
    sound(this).play("victory");
    this.scene.launch("victory", data);
  }

  openPause(): void {
    if (this.won || !this.sys.isActive() || this.scene.isActive("pause")) return;
    this.scene.pause();
    this.scene.launch("pause");
    sound(this).play("pause");
    sound(this).duck(true);
  }

  /** Called by the pause menu when it closes. */
  resumeFromPause(): void {
    sound(this).duck(false);
    this.input.keyboard?.resetKeys();
    this.scene.resume();
  }

  /** "Back to Checkpoint": full hearts, last checkpoint, keep coins & eggs. */
  restartFromCheckpoint(): void {
    this.respawn(true);
  }

  // ── Dev helpers (exposed via window.__arni in dev builds) ─────────

  debugState() {
    return {
      ...this.player,
      hearts: this.health.hearts,
      invulnMs: this.health.invulnMs,
      checkpoint: this.progress.checkpoint,
      coins: this.score.coins,
      eggs: this.score.eggs,
      enemiesLeft: this.enemies.aliveCount,
      tx: Math.floor(this.body.center.x / TILE_SIZE),
      ty: Math.floor((this.body.bottom - 1) / TILE_SIZE),
      paused: !this.sys.isActive(),
    };
  }

  debugTeleport(tx: number, ty: number): void {
    this.placeArniAt({ tx, ty });
  }

  // ── World building ────────────────────────────────────────────────

  private createBackground(): void {
    this.add.image(0, 0, themed("bg-sky", this.theme)).setOrigin(0).setScrollFactor(0).setDisplaySize(VIEW_WIDTH, VIEW_HEIGHT);
    const farKey = themed("bg-jungle", this.theme);
    this.bg = this.add
      .tileSprite(0, VIEW_HEIGHT, VIEW_WIDTH, ASSETS[farKey].height, farKey)
      .setOrigin(0, 1)
      .setScrollFactor(0);
  }

  private createCheckpoints(): void {
    for (const s of this.level.spawns) {
      if (s.kind !== "checkpoint") continue;
      const { x, y } = spawnPoint(s.tx, s.ty);
      const img = this.add.image(x, y, "checkpoint").setOrigin(0.5, 1);
      this.checkpoints.push({ pos: { tx: s.tx, ty: s.ty }, img, rect: { left: x - 24, right: x + 24, top: y - 112, bottom: y } });
    }
  }

  private createArni(): void {
    const start = spawnPoint(this.level.playerStart.tx, this.level.playerStart.ty);
    const size = bodyFor("stand");
    this.body = this.physics.add.body(start.x - size.width / 2, start.y - size.height, size.width, size.height);
    this.body.setAllowGravity(false); // gravity is applied by stepPlayer
    const a = ASSETS["arni-idle"];
    this.view = this.add.image(start.x, start.y, "arni-idle").setOrigin(a.originX, a.originY).setDepth(10);
    this.swordView = this.add.image(start.x, start.y, "sword").setOrigin(0, 0.5).setDepth(11).setVisible(false);
    this.lastBottom = this.body.bottom;
  }

  private createParticles(): void {
    if (!this.textures.exists("dust")) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1).fillCircle(8, 8, 8);
      g.generateTexture("dust", 16, 16);
      g.destroy();
    }
    this.dustFx = this.add.particles(0, 0, "dust", {
      lifespan: 350,
      speed: { min: 40, max: 140 },
      angle: { min: 200, max: 340 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 0.8, end: 0 },
      tint: 0xf3e2c0,
      emitting: false,
    });
    this.dustFx.setDepth(11);
    this.sparkFx = this.add.particles(0, 0, "dust", {
      lifespan: 450,
      speed: { min: 120, max: 320 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.6, end: 0 },
      tint: [0xffd36a, 0xff7a2e, 0xfff8d8, 0x3ef0d0],
      emitting: false,
    });
    this.sparkFx.setDepth(12);
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
    kb.on("keydown-ESC", () => this.openPause());
    kb.on("keydown-P", () => this.openPause());
  }

  private readInput(): PlayerInput {
    return inputFromPressed((name) => this.keys.get(name)?.isDown ?? false);
  }

  // ── Arni ──────────────────────────────────────────────────────────

  private canStand(): boolean {
    const { width, height } = bodyFor("stand");
    const cx = this.body.center.x;
    const bottom = this.body.bottom;
    return !rectHitsSolid(this.level, cx - width / 2, bottom - height, cx + width / 2, bottom - 1);
  }

  private updateArni(input: PlayerInput, dtMs: number): void {
    const b = this.body;
    const prevPose = this.player.pose;
    const ride = this.platforms.glue(b, this.player.rising || this.player.vy < -200);
    if (ride) {
      // Ride exactly on the surface, carried sideways by however far the slab moved.
      b.y = ride.body.top - b.height;
      b.x += ride.movedX;
    }
    const grounded = !!ride || b.blocked.down || b.touching.down;

    // Head bumped a block while rising (amber cracks open).
    if (b.blocked.up && this.lastSetVy < 0) this.blocks.bonk(this.lastSetVy);

    const { state, events } = stepPlayer(
      this.player,
      input,
      {
        grounded,
        canStand: this.canStand(),
        slippery: grounded && this.enemies.onGoo(this.arniRect()),
        canPound: hasPower(this.powers, "pound"),
        vx: b.velocity.x,
        vy: b.velocity.y,
      },
      dtMs,
    );
    this.player = state;

    if (this.blocks.springHit) {
      this.player = applySpring(this.player, input.jump || input.up);
      this.blocks.bounceFx(this.blocks.springHit);
      sound(this).play("bounce");
      this.blocks.springHit = null;
      this.squashView(0.7, 1.35, 120);
    } else if (ride && this.player.grounded) {
      // Keep pace with a slab moving up or down.
      this.player = { ...this.player, vy: ride.body.velocity.y + TUNING.groundStick };
    }

    if (this.player.pose !== prevPose) this.resizeBody(this.player.pose);
    b.setVelocity(this.player.vx, this.player.vy);
    this.lastSetVy = this.player.vy;

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

  // ── Damage & respawn ──────────────────────────────────────────────

  private touchHazard(tile: Phaser.Physics.Arcade.StaticBody, kind: string): void {
    if (kind === "lava") {
      // Lava works like a pit (one heart, back to the checkpoint) — never a
      // floor you can get stuck standing in while hearts drain away.
      if (this.dying) return;
      this.sparks(this.body.center.x, tile.top, 20);
      this.cameras.main.shake(150, 0.008);
      this.fellOut();
      return;
    }
    const fromAbove = this.body.bottom <= tile.top + 8;
    this.hurtArni(fromAbove ? 0 : (Math.sign(tile.center.x - this.body.center.x) as -1 | 1));
  }

  hurtArni(fromDir: -1 | 0 | 1): void {
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
    sound(this).play("hurt");
    this.hurtFlashUntil = this.time.now + 140;
  }

  /** Falling out of the world costs a heart and returns Arni to the checkpoint. */
  private fellOut(): void {
    const { health, result } = damage({ ...this.health, invulnMs: 0 });
    this.health = health;
    this.registry.set(HUD_KEYS.hearts, health.hearts);
    if (result === "dead") this.die();
    else this.respawn(false);
  }

  private die(): void {
    sound(this).play("death");
    this.dying = true;
    // Running out of hearts loses any power-ups (falling in a pit doesn't).
    this.powers = initialPowers();
    this.body.setVelocity(0, -500);
    this.player = { ...this.player, vy: -500, vx: 0 };
    this.tweens.add({ targets: this.view, angle: 720, alpha: 0, scale: 0.4, duration: RESPAWN_DELAY_MS * 0.8 });
    this.time.delayedCall(RESPAWN_DELAY_MS, () => this.respawn(true));
  }

  private respawn(refill: boolean): void {
    sound(this).play("respawn");
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
      sound(this).play("checkpoint");
      this.sparks(centerX(c.rect), c.rect.top + 20, 24);
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
    const puff = (n: number) => this.dust(this.body.center.x, this.body.bottom, n);
    for (const e of events) {
      switch (e) {
        case "jump":
          sound(this).play("jump");
          this.squashView(0.82, 1.2);
          puff(4);
          break;
        case "chargedJump":
          sound(this).play("chargedJump");
          this.squashView(0.7, 1.35, 120);
          puff(10);
          this.cameras.main.shake(80, 0.003);
          break;
        case "land":
          sound(this).play("land");
          this.squashView(1.25, 0.78);
          puff(5);
          break;
        case "slideStart":
          sound(this).play("slide");
          puff(6);
          break;
        case "chargeReady":
          sound(this).play("chargeReady");
          this.squashView(1.12, 0.9, 60);
          break;
        case "whip":
          sound(this).play(hasPower(this.powers, "sword") ? "sword" : "whip");
          this.enemies.newSwing();
          this.boss.newSwing();
          this.whipSwoosh();
          break;
        case "poundStart":
          this.squashView(0.8, 1.2, 80);
          break;
        case "poundLand":
          sound(this).play("pound");
          this.poundImpact();
          break;
        default:
          break;
      }
    }
  }

  /** Ground pound landing: smash blocks underfoot, shockwave nearby minions. */
  private poundImpact(): void {
    const b = this.body;
    this.blocks.smashBelow(this.arniRect());
    this.enemies.poundShock(b.center.x, b.bottom, TUNING.poundRadius);
    this.boss.poundShock(b.center.x, b.bottom, TUNING.poundRadius);
    this.cameras.main.shake(160, 0.01);
    this.squashView(1.45, 0.6, 140);
    this.dust(b.center.x - 30, b.bottom, 8);
    this.dust(b.center.x + 30, b.bottom, 8);
    const ring = this.add.ellipse(b.center.x, b.bottom - 4, 40, 14).setStrokeStyle(6, 0xffd36a, 1).setDepth(9);
    ring.isFilled = false;
    this.tweens.add({
      targets: ring,
      scaleX: (TUNING.poundRadius * 2) / 40,
      scaleY: 2,
      alpha: 0,
      duration: 350,
      ease: "Quad.out",
      onComplete: () => ring.destroy(),
    });
  }

  private whipSwoosh(): void {
    const sword = hasPower(this.powers, "sword");
    const r = whipHitbox(this.arniRect(), sword ? POWER.swordReachMult : 1);
    const ring = this.add
      .ellipse(centerX(r), (r.top + r.bottom) / 2, r.right - r.left, (r.bottom - r.top) * 0.9)
      .setStrokeStyle(9, sword ? 0xc9f1ff : 0xffd36a, 1)
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

  /** Runs after physics so every view sits exactly on its body. */
  private syncViews(): void {
    this.platforms.syncViews();
    this.enemies.syncViews();
    this.boss.syncView();

    const p = this.player;
    const v = this.view;
    v.setPosition(this.body.center.x, this.body.bottom);
    this.swordView.setVisible(false);
    if (this.dying) return;
    v.setFlipX(p.facing < 0);
    v.setTexture(p.pose === "stand" && !p.pounding ? "arni-idle" : "arni-crouch");

    if (p.pounding) {
      // Curled up and spinning on the way down.
      v.setAngle((this.time.now * 1.4 * p.facing) % 360);
    } else if (isWhipping(p)) {
      const angle = (1 - p.attackMs / TUNING.whipMs) * 360 * p.facing;
      v.setAngle(angle);
      if (hasPower(this.powers, "sword")) {
        // The tail swings the sword around with the spin.
        const rad = Phaser.Math.DegToRad(angle + (p.facing > 0 ? 180 : 0));
        this.swordView
          .setVisible(true)
          .setPosition(this.body.center.x, this.body.center.y)
          .setRotation(rad);
      }
    } else {
      const lean = p.pose === "slide" ? 10 * p.facing : (p.vx / TUNING.runSpeed) * 4;
      v.setAngle(lean);
    }

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
