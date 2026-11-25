/**
 * Asset manifest — the ONE place that maps texture keys to files.
 *
 * To swap in new art (e.g. hand-drawn PNGs), drop the file in
 * `public/arni/assets/` and change `file` here. Keep `width`/`height`
 * the same (or update them) and keep the origin at the character's feet
 * so physics and placement don't change.
 *
 * origin is 0..1 within the image: (0.5, 1) = bottom-center (feet),
 * (0.5, 0.5) = center (tiles).
 */
import type { GroundVariant } from "./level/parseLevel.js";
import type { SpawnKind, TileKind } from "./level/legend.js";
import { TILE_SIZE } from "./constants.js";

export interface AssetDef {
  file: string;
  width: number;
  height: number;
  originX: number;
  originY: number;
}

/** Relative to the site's public/ dir (and BASE_URL at runtime). */
export const ASSET_DIR = "arni/assets";

const tile = (file: string): AssetDef => ({
  file,
  width: TILE_SIZE,
  height: TILE_SIZE,
  originX: 0.5,
  originY: 0.5,
});

const feet = (file: string, width: number, height: number): AssetDef => ({
  file,
  width,
  height,
  originX: 0.5,
  originY: 1,
});

export const ASSETS = {
  // Characters
  "arni-idle": feet("arni-idle.svg", 96, 96),
  "banana-bunchling": feet("banana-bunchling.svg", 56, 72),
  "banana-peelback": feet("banana-peelback.svg", 56, 72),
  "banana-bruiser": feet("banana-bruiser.svg", 72, 80),
  "banana-spotter": feet("banana-spotter.svg", 56, 72),
  "banana-mush": feet("banana-mush.svg", 64, 56),

  // Tiles
  "tile-grass": tile("tile-grass.svg"),
  "tile-dirt": tile("tile-dirt.svg"),
  "tile-brick": tile("tile-brick.svg"),
  "tile-question": tile("tile-question.svg"),
  "tile-spikes": tile("tile-spikes.svg"),

  // Pickups & markers
  coin: { file: "coin.svg", width: 36, height: 36, originX: 0.5, originY: 0.5 },
  egg: feet("egg.svg", 44, 52),
  checkpoint: feet("checkpoint.svg", 48, 112),

  // Backgrounds
  "bg-sky": { file: "bg-sky.svg", width: 1280, height: 720, originX: 0, originY: 0 },
  "bg-hills": { file: "bg-hills.svg", width: 1280, height: 360, originX: 0, originY: 1 },
} satisfies Record<string, AssetDef>;

export type AssetKey = keyof typeof ASSETS;
export const ASSET_KEYS = Object.keys(ASSETS) as AssetKey[];

export function tileTextureKey(kind: TileKind, variant: GroundVariant): AssetKey {
  switch (kind) {
    case "ground":
      return variant === "top" ? "tile-grass" : "tile-dirt";
    case "brick":
      return "tile-brick";
    case "question":
      return "tile-question";
    case "spikes":
      return "tile-spikes";
  }
}

const SPAWN_TEXTURES: Record<SpawnKind, AssetKey> = {
  coin: "coin",
  egg: "egg",
  checkpoint: "checkpoint",
  bunchling: "banana-bunchling",
  peelback: "banana-peelback",
  bruiser: "banana-bruiser",
  spotter: "banana-spotter",
  mush: "banana-mush",
};

export function spawnTextureKey(kind: SpawnKind): AssetKey {
  return SPAWN_TEXTURES[kind];
}
