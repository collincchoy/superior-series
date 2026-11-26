import Phaser from "phaser";
import { tileTextureKey } from "../../assets.js";
import { hitAmber, breakTile, bonkTile, whipTargets, withTile, type TileHit } from "../../blocks.js";
import type { Rect } from "../../combat.js";
import { TILE_SIZE } from "../../constants.js";
import { TILE_PROPS, type TileKind } from "../../level/legend.js";
import { tileCenter, tileVariant } from "../../level/parseLevel.js";
import { landsOnTop, type LevelContext } from "../context.js";

const CRUMBLE_DELAY_MS = 450;
const CRUMBLE_REGROW_MS = 3000;

type TileSprite = Phaser.Physics.Arcade.Sprite & { body: Phaser.Physics.Arcade.StaticBody };

const key = (tx: number, ty: number) => `${tx},${ty}`;

/**
 * Builds the tile world and handles everything that changes it:
 * smashing breakables, cracking amber, crumbling rock, bounce mushrooms.
 */
export class Blocks {
  readonly solids: Phaser.Physics.Arcade.StaticGroup;
  readonly oneWays: Phaser.Physics.Arcade.StaticGroup;
  readonly hazards: Phaser.Physics.Arcade.StaticGroup;
  private sprites = new Map<string, TileSprite>();
  private crumbling = new Set<string>();
  /** Set by the bounce-mushroom collider; consumed by the scene each frame. */
  springHit: TileSprite | null = null;

  constructor(private ctx: LevelContext) {
    const { host: scene } = ctx;
    this.solids = scene.physics.add.staticGroup();
    this.oneWays = scene.physics.add.staticGroup();
    this.hazards = scene.physics.add.staticGroup();
    ctx.level.tiles.forEach((row, ty) => row.forEach((kind, tx) => kind && this.createTile(kind, tx, ty)));
  }

  private createTile(kind: TileKind, tx: number, ty: number): void {
    const { x, y } = tileCenter(tx, ty);
    const tex = tileTextureKey(kind, tileVariant(this.ctx.level, tx, ty));
    const props = TILE_PROPS[kind];
    const group = props.oneWay ? this.oneWays : props.hazard ? this.hazards : this.solids;
    const s = group.create(x, y, tex) as TileSprite;
    s.setData("tile", { tx, ty, kind });
    if (props.oneWay) s.body.setSize(TILE_SIZE, 20).setOffset(0, 2);
    if (kind === "thorns") s.body.setSize(TILE_SIZE, 34).setOffset(0, 30);
    if (kind === "lava") {
      s.body.setSize(TILE_SIZE, 48).setOffset(0, 16);
      this.ctx.host.tweens.add({ targets: s, alpha: 0.82, duration: 700 + ((tx * 37) % 300), yoyo: true, repeat: -1 });
    }
    this.sprites.set(key(tx, ty), s);
  }

  /** Wire Arni's colliders. Hazard contact is reported via onHazard. */
  addArniColliders(onHazard: (tile: TileSprite) => void): void {
    const { host: scene, arniBody } = this.ctx;
    scene.physics.add.collider(arniBody, this.solids, (_a, b) => this.onSolidContact(b as TileSprite));
    scene.physics.add.collider(arniBody, this.oneWays, undefined, (_a, b) =>
      landsOnTop(arniBody, (b as TileSprite).body.top),
    );
    scene.physics.add.collider(arniBody, this.hazards, (_a, b) => onHazard(b as TileSprite));
  }

  /** Enemies walk on all terrain but don't trigger gadgets. */
  addWalkerColliders(walker: Phaser.Physics.Arcade.Body): void {
    const { host: scene } = this.ctx;
    scene.physics.add.collider(walker, this.solids);
    scene.physics.add.collider(walker, this.hazards);
    scene.physics.add.collider(walker, this.oneWays, undefined, (_a, b) => landsOnTop(walker, (b as TileSprite).body.top));
  }

  private onSolidContact(tile: TileSprite): void {
    const { kind, tx, ty } = tile.getData("tile") as TileHit;
    const b = this.ctx.arniBody;
    const onTop = b.bottom <= tile.body.top + 2 && b.touching.down;
    if (kind === "bounce" && onTop) this.springHit = tile;
    if (kind === "crumble" && onTop) this.startCrumble(tx, ty, tile);
  }

  /** Squash the mushroom; the scene applies the launch to Arni. */
  bounceFx(tile: TileSprite): void {
    this.ctx.host.tweens.add({ targets: tile, scaleY: 0.7, scaleX: 1.2, duration: 70, yoyo: true, ease: "Quad.out" });
    this.ctx.sparks(tile.x, tile.body.top, 8);
  }

  // ── Whip & bonk ────────────────────────────────────────────────

  whip(whipRect: Rect): void {
    for (const t of whipTargets(this.ctx.level, whipRect)) this.strike(t);
  }

  /** Head bumped something while rising: amber cracks open. */
  bonk(prevVy: number): void {
    const hit = bonkTile(this.ctx.level, this.ctx.arniRect(), prevVy);
    if (hit?.kind === "amber") this.strike(hit);
    else if (hit) this.ctx.dust(this.ctx.arniBody.center.x, this.ctx.arniBody.top, 3);
  }

  private strike(t: TileHit): void {
    const sprite = this.sprites.get(key(t.tx, t.ty));
    if (!sprite) return;
    if (t.kind === "amber") {
      const { level, reward } = hitAmber(this.ctx.level, t.tx, t.ty);
      if (!reward) return;
      this.ctx.level = level;
      sprite.setTexture(tileTextureKey("spent", "single"));
      sprite.setData("tile", { ...t, kind: "spent" });
      this.ctx.host.tweens.add({ targets: sprite, y: sprite.y - 10, duration: 80, yoyo: true });
      this.ctx.addCoins(reward.coins, { x: sprite.x, y: sprite.y - TILE_SIZE / 2 });
      return;
    }
    if (TILE_PROPS[t.kind].breakable) {
      this.ctx.level = breakTile(this.ctx.level, t.tx, t.ty);
      this.sprites.delete(key(t.tx, t.ty));
      this.shatter(sprite, t.kind === "crate" ? 0xd9a35a : 0xe8b47a);
      sprite.destroy();
      this.ctx.host.cameras.main.shake(60, 0.003);
    }
  }

  private shatter(sprite: TileSprite, tint: number): void {
    const { host: scene } = this.ctx;
    for (let i = 0; i < 6; i++) {
      const chunk = scene.add
        .rectangle(sprite.x + Phaser.Math.Between(-16, 16), sprite.y + Phaser.Math.Between(-16, 16), 14, 14, tint)
        .setStrokeStyle(2, 0x4d2f12)
        .setDepth(12);
      scene.tweens.add({
        targets: chunk,
        x: chunk.x + Phaser.Math.Between(-90, 90),
        y: chunk.y + Phaser.Math.Between(40, 140),
        angle: Phaser.Math.Between(-360, 360),
        alpha: 0,
        duration: 600,
        ease: "Quad.in",
        onComplete: () => chunk.destroy(),
      });
    }
  }

  // ── Crumbly rock ───────────────────────────────────────────────

  private startCrumble(tx: number, ty: number, sprite: TileSprite): void {
    const k = key(tx, ty);
    if (this.crumbling.has(k)) return;
    this.crumbling.add(k);
    const { host: scene } = this.ctx;
    const x0 = sprite.x;
    scene.tweens.add({ targets: sprite, x: x0 + 3, duration: 50, yoyo: true, repeat: Math.floor(CRUMBLE_DELAY_MS / 100) });
    scene.time.delayedCall(CRUMBLE_DELAY_MS, () => {
      sprite.x = x0;
      sprite.body.enable = false;
      this.ctx.level = withTile(this.ctx.level, tx, ty, null);
      scene.tweens.add({ targets: sprite, y: sprite.y + 120, alpha: 0, duration: 450, ease: "Quad.in" });
      scene.time.delayedCall(CRUMBLE_REGROW_MS, () => this.regrow(tx, ty, sprite));
    });
  }

  private regrow(tx: number, ty: number, sprite: TileSprite): void {
    const { x, y } = tileCenter(tx, ty);
    const cell = { left: x - TILE_SIZE / 2, right: x + TILE_SIZE / 2, top: y - TILE_SIZE / 2, bottom: y + TILE_SIZE / 2 };
    const a = this.ctx.arniRect();
    const blocked = a.left < cell.right && a.right > cell.left && a.top < cell.bottom && a.bottom > cell.top;
    if (blocked) {
      this.ctx.host.time.delayedCall(500, () => this.regrow(tx, ty, sprite));
      return;
    }
    sprite.setPosition(x, y).setAlpha(0).setScale(0.6);
    sprite.body.enable = true;
    sprite.body.updateFromGameObject();
    this.ctx.level = withTile(this.ctx.level, tx, ty, "crumble");
    this.ctx.host.tweens.add({ targets: sprite, alpha: 1, scale: 1, duration: 300, ease: "Back.out" });
    this.crumbling.delete(key(tx, ty));
  }
}
