/**
 * Level legend: one character per tile in an ASCII level string.
 * Tiles live in the grid; spawns are entities placed on top of an empty cell.
 */

export const TILE_KINDS = ["ground", "brick", "question", "spikes"] as const;
export type TileKind = (typeof TILE_KINDS)[number];

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
  B: "brick",
  "?": "question",
  "^": "spikes",
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
