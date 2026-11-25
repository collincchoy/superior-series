import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  ASSETS,
  ASSET_DIR,
  tileTextureKey,
  spawnTextureKey,
} from "../../lib/arni/assets.js";
import { TILE_KINDS, SPAWN_KINDS } from "../../lib/arni/level/legend.js";
import { TILE_VARIANTS } from "../../lib/arni/level/parseLevel.js";

const publicDir = resolve(__dirname, "../../../public");

describe("asset manifest", () => {
  it("every asset file exists under public/", () => {
    for (const [key, asset] of Object.entries(ASSETS)) {
      const file = resolve(publicDir, ASSET_DIR, asset.file);
      expect(existsSync(file), `${key} → ${asset.file}`).toBe(true);
    }
  });

  it("every asset has a positive size and an origin within 0..1", () => {
    for (const [key, a] of Object.entries(ASSETS)) {
      expect(a.width, key).toBeGreaterThan(0);
      expect(a.height, key).toBeGreaterThan(0);
      for (const o of [a.originX, a.originY]) {
        expect(o, key).toBeGreaterThanOrEqual(0);
        expect(o, key).toBeLessThanOrEqual(1);
      }
    }
  });

  it("every tile kind × variant has a texture", () => {
    for (const kind of TILE_KINDS) {
      for (const v of TILE_VARIANTS) {
        expect(ASSETS[tileTextureKey(kind, v)], `${kind}/${v}`).toBeDefined();
      }
    }
  });

  it("ground and branches have distinct end-cap textures", () => {
    for (const kind of ["ground", "branch"] as const) {
      const keys = new Set(
        (["top", "topLeft", "topRight", "topSolo"] as const).map((v) => tileTextureKey(kind, v)),
      );
      expect(keys.size, kind).toBe(4);
    }
    expect(tileTextureKey("ground", "fill")).not.toBe(tileTextureKey("ground", "fillFossil"));
  });

  it("Arni has a texture for every pose, all the same frame size", () => {
    const poses = ["arni-idle", "arni-crouch"] as const;
    for (const p of poses) {
      expect(ASSETS[p], p).toBeDefined();
      expect(ASSETS[p].width).toBe(ASSETS["arni-idle"].width);
      expect(ASSETS[p].height).toBe(ASSETS["arni-idle"].height);
    }
  });

  it("every spawn kind has a texture", () => {
    for (const kind of SPAWN_KINDS) {
      expect(ASSETS[spawnTextureKey(kind)], kind).toBeDefined();
    }
  });

  it("has a texture for Arni", () => {
    expect(ASSETS["arni-idle"]).toBeDefined();
  });
});
