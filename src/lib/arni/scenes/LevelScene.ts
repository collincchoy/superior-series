import Phaser from "phaser";
import { ASSETS, spawnTextureKey, tileTextureKey, type AssetKey } from "../assets.js";
import {
  GRAVITY_Y,
  JUMP_VELOCITY,
  RUN_SPEED,
  TILE_SIZE,
  VIEW_HEIGHT,
  VIEW_WIDTH,
} from "../constants.js";
import { inputFromPressed, KEYBOARD_BINDINGS, ACTIONS, type PlayerInput } from "../input.js";
import {
  groundVariant,
  parseLevel,
  spawnPoint,
  tileCenter,
  type Level,
} from "../level/parseLevel.js";
import { TEST_LEVEL } from "../level/levels/testLevel.js";

/** Arni's collision box (smaller than the art so edges feel fair). */
const ARNI_BODY = { width: 44, height: 78 };

/**
 * Thin Phaser adapter: builds the world from parsed level data and wires input.
 * Gameplay rules move into pure, tested modules in later milestones.
 */
export class LevelScene extends Phaser.Scene {
  private level!: Level;
  private arni!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private hills!: Phaser.GameObjects.TileSprite;
  private keys = new Map<string, Phaser.Input.Keyboard.Key>();
  private prevJump = false;

  constructor() {
    super("level");
  }

  create(): void {
    this.level = parseLevel(TEST_LEVEL);
    const worldW = this.level.width * TILE_SIZE;
    const worldH = this.level.height * TILE_SIZE;

    this.physics.world.gravity.y = GRAVITY_Y;
    this.physics.world.setBounds(0, 0, worldW, worldH + TILE_SIZE * 4);

    this.createBackground();
    const solids = this.createTiles();
    this.createSpawns();
    this.createArni();
    this.physics.add.collider(this.arni, solids);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, worldW, worldH);
    cam.startFollow(this.arni, true, 0.12, 0.12, 0, 40);
    cam.setDeadzone(160, 120);

    this.bindKeyboard();
  }

  update(): void {
    this.hills.tilePositionX = this.cameras.main.scrollX * 0.3;
    this.updateArni(this.readInput());
  }

  // ── World building ────────────────────────────────────────────────

  private createBackground(): void {
    this.add.image(0, 0, "bg-sky").setOrigin(0).setScrollFactor(0).setDisplaySize(VIEW_WIDTH, VIEW_HEIGHT);
    const hills = ASSETS["bg-hills"];
    this.hills = this.add
      .tileSprite(0, VIEW_HEIGHT, VIEW_WIDTH, hills.height, "bg-hills")
      .setOrigin(0, 1)
      .setScrollFactor(0);
  }

  private createTiles(): Phaser.Physics.Arcade.StaticGroup {
    const solids = this.physics.add.staticGroup();
    this.level.tiles.forEach((row, ty) =>
      row.forEach((kind, tx) => {
        if (!kind) return;
        const { x, y } = tileCenter(tx, ty);
        const key = tileTextureKey(kind, groundVariant(this.level, tx, ty));
        // Spikes are solid for now; Milestone 3 makes them hurt.
        solids.create(x, y, key);
      }),
    );
    return solids;
  }

  private createSpawns(): void {
    for (const spawn of this.level.spawns) {
      const key = spawnTextureKey(spawn.kind);
      const { x, y } = spawnPoint(spawn.tx, spawn.ty);
      const img = this.placeImage(key, x, y);

      if (spawn.kind === "coin") {
        img.setY(y - TILE_SIZE / 2);
        this.tweens.add({ targets: img, y: img.y - 6, duration: 700, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      } else if (spawn.kind !== "checkpoint" && spawn.kind !== "egg") {
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
    const a = ASSETS["arni-idle"];
    this.arni = this.physics.add.sprite(start.x, start.y, "arni-idle").setOrigin(a.originX, a.originY);
    this.arni.body.setSize(ARNI_BODY.width, ARNI_BODY.height);
    this.arni.body.setOffset((a.width - ARNI_BODY.width) / 2, a.height - ARNI_BODY.height);
    this.arni.setDepth(10);
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

  // ── Placeholder movement (replaced by a tuned state machine in Milestone 2) ──

  private updateArni(input: PlayerInput): void {
    const body = this.arni.body;
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    body.setVelocityX(dir * RUN_SPEED);
    if (dir !== 0) this.arni.setFlipX(dir < 0);

    const jumpHeld = input.jump || input.up;
    if (jumpHeld && !this.prevJump && body.blocked.down) {
      body.setVelocityY(-JUMP_VELOCITY);
    }
    this.prevJump = jumpHeld;

    // Fell out of the world → back to start (real respawn/checkpoints in Milestone 3).
    if (this.arni.y > this.level.height * TILE_SIZE + TILE_SIZE * 2) {
      const start = spawnPoint(this.level.playerStart.tx, this.level.playerStart.ty);
      this.arni.setPosition(start.x, start.y);
      body.setVelocity(0, 0);
    }
  }
}
