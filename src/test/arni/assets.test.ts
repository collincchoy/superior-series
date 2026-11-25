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

  it("every tile kind (and ground variant) has a texture", () => {
    for (const kind of TILE_KINDS) {
      expect(ASSETS[tileTextureKey(kind, "top")], kind).toBeDefined();
      expect(ASSETS[tileTextureKey(kind, "fill")], kind).toBeDefined();
    }
  });

  it("ground uses different textures for top and fill", () => {
    expect(tileTextureKey("ground", "top")).not.toBe(
      tileTextureKey("ground", "fill"),
    );
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
