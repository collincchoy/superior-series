import Phaser from "phaser";
import { ASSETS, spawnTextureKey, tileTextureKey, type AssetKey } from "../assets.js";
import { TILE_SIZE, VIEW_HEIGHT, VIEW_WIDTH } from "../constants.js";
import { ACTIONS, inputFromPressed, KEYBOARD_BINDINGS, type PlayerInput } from "../input.js";
import { rectHitsSolid } from "../level/collision.js";
import { TILE_PROPS } from "../level/legend.js";
import { TEST_LEVEL } from "../level/levels/testLevel.js";
import {
  parseLevel,
  spawnPoint,
  tileCenter,
  tileVariant,
  type Level,
} from "../level/parseLevel.js";
import {
  bodyFor,
  initialPlayer,
  stepPlayer,
  type PlayerEvent,
  type PlayerState,
  type Pose,
} from "../player.js";
import { TUNING } from "../tuning.js";

/** Max simulated frame time, so a hitch doesn't launch Arni through floors. */
const MAX_DT_MS = 50;
const LOOKAHEAD_X = 110;
const CHARGE_TINT = 0xfff27a;

/**
 * Thin Phaser adapter. Rules live in pure modules (player.ts, level/*);
 * this scene builds the world, feeds input/contacts in, and draws results.
 *
 * Arni is two objects: an invisible physics Body (size changes with pose)
 * and a view Image that follows it — so squash/stretch tweens never
 * disturb collisions.
 */
export class LevelScene extends Phaser.Scene {
  private level!: Level;
  private body!: Phaser.Physics.Arcade.Body;
  private view!: Phaser.GameObjects.Image;
  private bg!: Phaser.GameObjects.TileSprite;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private player: PlayerState = initialPlayer();
  private keys = new Map<string, Phaser.Input.Keyboard.Key>();
  private lookahead = 0;

  constructor() {
    super("level");
  }

  create(): void {
    this.level = parseLevel(TEST_LEVEL);
    this.player = initialPlayer();
    const worldW = this.level.width * TILE_SIZE;
    const worldH = this.level.height * TILE_SIZE;

    this.physics.world.setBounds(0, 0, worldW, worldH + TILE_SIZE * 4);

    this.createBackground();
    const { solids, oneWays } = this.createTiles();
    this.createSpawns();
    this.createArni();
    this.createDust();

    this.physics.add.collider(this.body, solids);
    this.physics.add.collider(this.body, oneWays, undefined, (_a, b) => this.landsOnOneWay(b));

    const cam = this.cameras.main;
    cam.setBounds(0, 0, worldW, worldH);
    cam.startFollow(this.view, true, 0.12, 0.08);
    cam.setDeadzone(60, 140);

    this.bindKeyboard();
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncView, this);
  }

  update(_time: number, delta: number): void {
    this.bg.tilePositionX = this.cameras.main.scrollX * 0.3;
    this.updateArni(this.readInput(), Math.min(delta, MAX_DT_MS));
    this.updateCamera();
  }

  // ── Dev helpers (exposed via window.__arni in dev builds) ─────────

  debugState(): PlayerState & { tx: number; ty: number } {
    return {
      ...this.player,
      tx: Math.floor(this.body.center.x / TILE_SIZE),
      ty: Math.floor((this.body.bottom - 1) / TILE_SIZE),
    };
  }

  debugTeleport(tx: number, ty: number): void {
    const { x, y } = spawnPoint(tx, ty);
    this.player = initialPlayer();
    this.resizeBody("stand");
    this.body.reset(x - this.body.width / 2, y - this.body.height);
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
    this.level.tiles.forEach((row, ty) =>
      row.forEach((kind, tx) => {
        if (!kind) return;
        const { x, y } = tileCenter(tx, ty);
        const key = tileTextureKey(kind, tileVariant(this.level, tx, ty));
        if (TILE_PROPS[kind].oneWay) {
          const plat = oneWays.create(x, y, key) as Phaser.Physics.Arcade.Sprite;
          // Only the top sliver of a branch is standable.
          const b = plat.body as Phaser.Physics.Arcade.StaticBody;
          b.setSize(TILE_SIZE, 20).setOffset(0, 2);
        } else {
          // Thorns are solid for now; Milestone 3 makes them hurt.
          solids.create(x, y, key);
        }
      }),
    );
    return { solids, oneWays };
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
      } else if (spawn.kind !== "checkpoint") {
        // Banana minions: idle squash-and-stretch (AI arrives in Milestone 5).
        this.tweens.add({
          targets: img,
          scaleY: 0.9,
          scaleX: 1.08,
          duration: 380 + Math.random() * 200,
          yoyo: true,
          repeat: -1,
          ease: "Sine.inOut",
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
  }

  private createDust(): void {
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

    // Fell out of the world → back to start (real respawn/checkpoints in Milestone 3).
    if (b.top > this.level.height * TILE_SIZE + TILE_SIZE) {
      const start = spawnPoint(this.level.playerStart.tx, this.level.playerStart.ty);
      this.player = initialPlayer();
      this.resizeBody("stand");
      b.reset(start.x - b.width / 2, start.y - b.height);
    }

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

  private playEvents(events: PlayerEvent[]): void {
    const squash = (sx: number, sy: number, ms = 90) => {
      this.tweens.killTweensOf(this.view);
      this.view.setScale(sx, sy);
      this.tweens.add({ targets: this.view, scaleX: 1, scaleY: 1, duration: ms * 2, ease: "Back.out" });
    };
    const puff = (n: number) => this.dust.emitParticleAt(this.body.center.x, this.body.bottom, n);

    for (const e of events) {
      switch (e) {
        case "jump":
          squash(0.82, 1.2);
          puff(4);
          break;
        case "chargedJump":
          squash(0.7, 1.35, 120);
          puff(10);
          this.cameras.main.shake(80, 0.003);
          break;
        case "land":
          squash(1.25, 0.78);
          puff(5);
          break;
        case "slideStart":
          puff(6);
          break;
        case "chargeReady":
          squash(1.12, 0.9, 60);
          break;
        default:
          break;
      }
    }
  }

  /** Runs after physics so the view sits exactly on the body. */
  private syncView(): void {
    const p = this.player;
    const v = this.view;
    v.setPosition(this.body.center.x, this.body.bottom);
    v.setFlipX(p.facing < 0);
    v.setTexture(p.pose === "stand" ? "arni-idle" : "arni-crouch");

    // Lean into motion; slides tilt further.
    const lean = p.pose === "slide" ? 10 : (p.vx / TUNING.runSpeed) * 4;
    v.setAngle(lean * (p.pose === "slide" ? p.facing : 1));

    // Blink while a charged jump is ready.
    const charged = p.chargeMs >= TUNING.chargeMinMs;
    if (charged && Math.floor(this.time.now / 90) % 2 === 0) v.setTint(CHARGE_TINT);
    else v.clearTint();
  }

  private updateCamera(): void {
    const p = this.player;
    const target = Math.abs(p.vx) > 40 ? p.facing * LOOKAHEAD_X : this.lookahead;
    this.lookahead += (target - this.lookahead) * 0.04;
    this.cameras.main.setFollowOffset(-this.lookahead, 40);
  }
}
