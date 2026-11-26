/**
 * Level legend: one character per tile in an ASCII level string.
 * Tiles live in the grid; spawns are entities placed on top of an empty cell.
 */

export const TILE_KINDS = [
  "ground", // volcanic basalt
  "branch", // tree branch — one-way platform (jump up through it)
  "boulder", // cracked pumice boulder — breakable (jungle)
  "crate", // Rex's banana crate — breakable (factory)
  "amber", // glowing amber — mystery block, holds goodies
  "spent", // amber that's been cracked open — just a block now
  "thorns", // bramble — hurts
  "lava", // lava pool — hurts
  "bounce", // bouncy lava-mushroom — springs Arni high
  "crumble", // crumbly rock — falls shortly after being stood on, then regrows
] as const;
export type TileKind = (typeof TILE_KINDS)[number];

export interface TileProps {
  /** Blocks movement from every side. */
  solid: boolean;
  /** Can be stood on from above, passed through from below/sides. */
  oneWay: boolean;
  /** Something Arni can stand on (hazards don't count). */
  standable: boolean;
  /** Touching it hurts. */
  hazard: boolean;
  /** The tail whip smashes it. */
  breakable: boolean;
}

const solid = { solid: true, oneWay: false, standable: true, hazard: false, breakable: false };

export const TILE_PROPS: Record<TileKind, TileProps> = {
  ground: solid,
  branch: { ...solid, solid: false, oneWay: true },
  boulder: { ...solid, breakable: true },
  crate: { ...solid, breakable: true },
  amber: solid,
  spent: solid,
  thorns: { ...solid, standable: false, hazard: true },
  lava: { ...solid, standable: false, hazard: true },
  bounce: solid,
  crumble: solid,
};

export const SPAWN_KINDS = [
  "coin",
  "egg",
  "checkpoint",
  // Moving stone slabs (2 tiles wide, spawn marks the left tile)
  "platformH", // slides right and back
  "platformV", // rises and falls
  // Rex's banana minions, by ripeness
  "bunchling", // green — jittery walker
  "peelback", // ripe yellow — charger
  "bruiser", // bruised — tough, 2 HP
  "spotter", // brown — lobs peels
  "mush", // rotten — goo trail, splits
] as const;
export type SpawnKind = (typeof SPAWN_KINDS)[number];

export const EMPTY_CHARS = new Set([".", " "]);
export const PLAYER_START_CHAR = "P";

export const TILE_CHARS: Record<string, TileKind> = {
  "#": "ground",
  "=": "branch",
  R: "boulder",
  X: "crate",
  A: "amber",
  a: "spent",
  "^": "thorns",
  "~": "lava",
  U: "bounce",
  "%": "crumble",
};

export const SPAWN_CHARS: Record<string, SpawnKind> = {
  o: "coin",
  E: "egg",
  C: "checkpoint",
  H: "platformH",
  V: "platformV",
  g: "bunchling",
  y: "peelback",
  b: "bruiser",
  s: "spotter",
  m: "mush",
};
