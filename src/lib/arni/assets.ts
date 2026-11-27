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
import type { TileVariant } from "./level/parseLevel.js";
import type { PowerUpKind, SpawnKind, TileKind } from "./level/legend.js";
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

  "arni-crouch": feet("arni-crouch.svg", 96, 96),

  // Terrain — volcanic basalt with glowing cracks
  "ground-top": tile("ground-top.svg"),
  "ground-top-left": tile("ground-top-left.svg"),
  "ground-top-right": tile("ground-top-right.svg"),
  "ground-top-solo": tile("ground-top-solo.svg"),
  "ground-fill": tile("ground-fill.svg"),
  "ground-crystal": tile("ground-crystal.svg"),
  "ground-crack": tile("ground-crack.svg"),
  // One-way tree branches
  "branch-mid": tile("branch-mid.svg"),
  "branch-left": tile("branch-left.svg"),
  "branch-right": tile("branch-right.svg"),
  "branch-solo": tile("branch-solo.svg"),
  // Blocks & hazards
  boulder: tile("boulder.svg"),
  crate: tile("crate.svg"),
  amber: tile("amber.svg"),
  spent: tile("amber-spent.svg"),
  thorns: tile("thorns.svg"),
  lava: tile("lava.svg"),
  bounce: tile("bounce.svg"),
  crumble: tile("crumble.svg"),

  // Pickups & markers
  coin: { file: "coin.svg", width: 36, height: 36, originX: 0.5, originY: 0.5 },
  egg: feet("egg.svg", 44, 52),
  checkpoint: feet("checkpoint.svg", 48, 112),
  "checkpoint-on": feet("checkpoint-on.svg", 48, 112),

  // HUD
  "heart-full": { file: "heart-full.svg", width: 44, height: 40, originX: 0, originY: 0 },
  "heart-empty": { file: "heart-empty.svg", width: 44, height: 40, originX: 0, originY: 0 },
  "heart-bonus": { file: "heart-bonus.svg", width: 44, height: 40, originX: 0, originY: 0 },

  // Power-ups (pickup orbs; also used as HUD timer icons)
  "powerup-heart": { file: "powerup-heart.svg", width: 48, height: 48, originX: 0.5, originY: 0.5 },
  "powerup-fire": { file: "powerup-fire.svg", width: 48, height: 48, originX: 0.5, originY: 0.5 },
  "powerup-pound": { file: "powerup-pound.svg", width: 48, height: 48, originX: 0.5, originY: 0.5 },
  "powerup-sword": { file: "powerup-sword.svg", width: 48, height: 48, originX: 0.5, originY: 0.5 },
  fireball: { file: "fireball.svg", width: 44, height: 28, originX: 0.5, originY: 0.5 },
  sword: { file: "sword.svg", width: 96, height: 24, originX: 0, originY: 0.5 },

  // Boss
  rex: feet("rex.svg", 128, 160),
  "rex-dizzy": feet("rex-dizzy.svg", 128, 160),
  "rex-defeated": feet("rex-defeated.svg", 128, 160),
  gate: tile("gate.svg"),
  throne: feet("throne.svg", 180, 220),
  "hud-coin": { file: "coin.svg", width: 32, height: 32, originX: 0, originY: 0 },
  "hud-egg": { file: "egg.svg", width: 30, height: 36, originX: 0, originY: 0 },
  "hud-egg-empty": { file: "egg-empty.svg", width: 30, height: 36, originX: 0, originY: 0 },
  "pause-button": { file: "pause-button.svg", width: 56, height: 56, originX: 1, originY: 0 },

  // Gadgets & effects
  platform: { file: "platform.svg", width: 128, height: 28, originX: 0, originY: 0 },
  peel: { file: "peel.svg", width: 36, height: 28, originX: 0.5, originY: 0.5 },
  goo: feet("goo.svg", 56, 14),
  "banana-minimush": feet("banana-mush.svg", 40, 35),
  crownie: { file: "crownie.svg", width: 80, height: 56, originX: 0.5, originY: 1 },
  "enemy-fire": { file: "enemy-fire.svg", width: 32, height: 32, originX: 0.5, originY: 0.5 },

  // Backgrounds
  "bg-sky": { file: "bg-sky.svg", width: 1280, height: 720, originX: 0, originY: 0 },
  "bg-jungle": { file: "bg-jungle.svg", width: 1280, height: 420, originX: 0, originY: 1 },

  // Rex's Banana Factory (levels 6–10) — swapped in by themed()
  "f-ground-top": tile("f-ground-top.svg"),
  "f-ground-top-left": tile("f-ground-top-left.svg"),
  "f-ground-top-right": tile("f-ground-top-right.svg"),
  "f-ground-top-solo": tile("f-ground-top-solo.svg"),
  "f-ground-fill": tile("f-ground-fill.svg"),
  "f-ground-accent": tile("f-ground-accent.svg"),
  "f-ground-vent": tile("f-ground-vent.svg"),
  "f-girder-mid": tile("f-girder-mid.svg"),
  "f-girder-left": tile("f-girder-left.svg"),
  "f-girder-right": tile("f-girder-right.svg"),
  "f-girder-solo": tile("f-girder-solo.svg"),
  "f-goo": tile("f-goo.svg"),
  "f-shredder": tile("f-shredder.svg"),
  "f-spring": tile("f-spring.svg"),
  "f-grate": tile("f-grate.svg"),
  "f-platform": { file: "f-platform.svg", width: 128, height: 28, originX: 0, originY: 0 },
  "bg-factory-wall": { file: "bg-factory-wall.svg", width: 1280, height: 720, originX: 0, originY: 0 },
  "bg-factory": { file: "bg-factory.svg", width: 1280, height: 420, originX: 0, originY: 1 },
} satisfies Record<string, AssetDef>;

export type AssetKey = keyof typeof ASSETS;
export const ASSET_KEYS = Object.keys(ASSETS) as AssetKey[];

const GROUND_TEXTURES: Record<TileVariant, AssetKey> = {
  top: "ground-top",
  topLeft: "ground-top-left",
  topRight: "ground-top-right",
  topSolo: "ground-top-solo",
  fill: "ground-fill",
  fillAccent: "ground-crystal",
  fillCrack: "ground-crack",
  single: "ground-top-solo",
};

const BRANCH_TEXTURES: Record<TileVariant, AssetKey> = {
  top: "branch-mid",
  topLeft: "branch-left",
  topRight: "branch-right",
  topSolo: "branch-solo",
  fill: "branch-mid",
  fillAccent: "branch-mid",
  fillCrack: "branch-mid",
  single: "branch-solo",
};

export function tileTextureKey(kind: TileKind, variant: TileVariant): AssetKey {
  switch (kind) {
    case "ground":
      return GROUND_TEXTURES[variant];
    case "branch":
      return BRANCH_TEXTURES[variant];
    case "boulder":
    case "crate":
    case "amber":
    case "spent":
    case "thorns":
    case "lava":
    case "bounce":
    case "crumble":
      return kind;
  }
}

const SPAWN_TEXTURES: Record<SpawnKind, AssetKey> = {
  coin: "coin",
  egg: "egg",
  checkpoint: "checkpoint",
  platformH: "platform",
  platformV: "platform",
  rex: "rex",
  gate: "gate",
  bunchling: "banana-bunchling",
  peelback: "banana-peelback",
  bruiser: "banana-bruiser",
  spotter: "banana-spotter",
  mush: "banana-mush",
  crownie: "crownie",
};

export function spawnTextureKey(kind: SpawnKind): AssetKey {
  return SPAWN_TEXTURES[kind];
}

export function powerUpTextureKey(kind: PowerUpKind): AssetKey {
  return `powerup-${kind}`;
}

export type Theme = "volcano" | "factory";

/** Factory replacements for volcano art (same size and anchor, so physics is unchanged). */
const FACTORY: Partial<Record<AssetKey, AssetKey>> = {
  "ground-top": "f-ground-top",
  "ground-top-left": "f-ground-top-left",
  "ground-top-right": "f-ground-top-right",
  "ground-top-solo": "f-ground-top-solo",
  "ground-fill": "f-ground-fill",
  "ground-crystal": "f-ground-accent",
  "ground-crack": "f-ground-vent",
  "branch-mid": "f-girder-mid",
  "branch-left": "f-girder-left",
  "branch-right": "f-girder-right",
  "branch-solo": "f-girder-solo",
  boulder: "crate",
  lava: "f-goo",
  thorns: "f-shredder",
  bounce: "f-spring",
  crumble: "f-grate",
  platform: "f-platform",
  "bg-sky": "bg-factory-wall",
  "bg-jungle": "bg-factory",
};

/** The texture to draw for `key` in a level of the given theme. */
export function themed(key: AssetKey, theme: Theme): AssetKey {
  return theme === "factory" ? (FACTORY[key] ?? key) : key;
}
