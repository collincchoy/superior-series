/**
 * Level legend: one character per tile in an ASCII level string.
 * Tiles live in the grid; spawns are entities placed on top of an empty cell.
 */

export const TILE_KINDS = [
  "ground", // mossy jungle earth / layered rock
  "branch", // tree branch — one-way platform (jump up through it)
  "boulder", // cracked boulder — breakable (jungle)
  "crate", // Rex's banana crate — breakable (factory)
  "amber", // glowing amber — mystery block, holds goodies
  "thorns", // bramble — hurts
] as const;
export type TileKind = (typeof TILE_KINDS)[number];

export interface TileProps {
  /** Blocks movement from every side. */
  solid: boolean;
  /** Can be stood on from above, passed through from below/sides. */
  oneWay: boolean;
  /** Something Arni can stand on (thorns hurt, so they don't count). */
  standable: boolean;
}

export const TILE_PROPS: Record<TileKind, TileProps> = {
  ground: { solid: true, oneWay: false, standable: true },
  branch: { solid: false, oneWay: true, standable: true },
  boulder: { solid: true, oneWay: false, standable: true },
  crate: { solid: true, oneWay: false, standable: true },
  amber: { solid: true, oneWay: false, standable: true },
  thorns: { solid: true, oneWay: false, standable: false },
};

export const SPAWN_KINDS = [
  "coin",
  "egg",
  "checkpoint",
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
  "^": "thorns",
};

export const SPAWN_CHARS: Record<string, SpawnKind> = {
  o: "coin",
  E: "egg",
  C: "checkpoint",
  g: "bunchling",
  y: "peelback",
  b: "bruiser",
  s: "spotter",
  m: "mush",
};
