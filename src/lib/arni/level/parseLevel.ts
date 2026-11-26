import { TILE_SIZE } from "../constants.js";
import {
  AMBER_CHARS,
  EMPTY_CHARS,
  PLAYER_START_CHAR,
  SPAWN_CHARS,
  TILE_CHARS,
  type PowerUpKind,
  type SpawnKind,
  type TileKind,
} from "./legend.js";

export interface TilePos {
  tx: number;
  ty: number;
}

export interface Spawn extends TilePos {
  kind: SpawnKind;
}

export interface Level {
  width: number;
  height: number;
  /** tiles[ty][tx] */
  tiles: (TileKind | null)[][];
  spawns: Spawn[];
  playerStart: TilePos;
  /** Power-ups inside amber blocks, keyed "tx,ty". Amber not listed holds coins. */
  amberContents: Record<string, PowerUpKind>;
}

export const TILE_VARIANTS = [
  "top",
  "topLeft",
  "topRight",
  "topSolo",
  "fill",
  "fillAccent",
  "fillCrack",
  "single",
] as const;
export type TileVariant = (typeof TILE_VARIANTS)[number];

/** Parse an ASCII level (one string per row, top to bottom). Throws on invalid input. */
export function parseLevel(rows: readonly string[]): Level {
  if (rows.length === 0) throw new Error("Level has no rows");
  const width = rows[0].length;
  const tiles: (TileKind | null)[][] = [];
  const spawns: Spawn[] = [];
  const starts: TilePos[] = [];
  const amberContents: Record<string, PowerUpKind> = {};

  rows.forEach((row, ty) => {
    if (row.length !== width) {
      throw new Error(
        `Level row ${ty + 1} has length ${row.length}, expected ${width}`,
      );
    }
    const tileRow: (TileKind | null)[] = [];
    [...row].forEach((ch, tx) => {
      if (EMPTY_CHARS.has(ch)) {
        tileRow.push(null);
      } else if (ch in TILE_CHARS) {
        tileRow.push(TILE_CHARS[ch]);
      } else if (ch in AMBER_CHARS) {
        tileRow.push("amber");
        amberContents[`${tx},${ty}`] = AMBER_CHARS[ch];
      } else if (ch in SPAWN_CHARS) {
        tileRow.push(null);
        spawns.push({ kind: SPAWN_CHARS[ch], tx, ty });
      } else if (ch === PLAYER_START_CHAR) {
        tileRow.push(null);
        starts.push({ tx, ty });
      } else {
        throw new Error(
          `Unknown level character '${ch}' at row ${ty + 1}, col ${tx + 1}`,
        );
      }
    });
    tiles.push(tileRow);
  });

  if (starts.length !== 1) {
    throw new Error(
      `Level needs exactly one player start '${PLAYER_START_CHAR}', found ${starts.length}`,
    );
  }

  return { width, height: rows.length, tiles, spawns, playerStart: starts[0], amberContents };
}

/**
 * Which art variant a tile uses, so terrain looks organic rather than gridded:
 * basalt caps with chamfered ends on exposed sides, rock fill with the odd crystal,
 * and branches with leafy end caps.
 */
export function tileVariant(level: Level, tx: number, ty: number): TileVariant {
  const kind = level.tiles[ty][tx];
  if (kind === "ground") {
    if (ty > 0 && level.tiles[ty - 1][tx] === "ground") {
      const h = tileHash(tx, ty) % 100;
      if (h < 8) return "fillAccent";
      if (h < 30) return "fillCrack";
      return "fill";
    }
    return edgeVariant(level, tx, ty, kind);
  }
  if (kind === "branch") return edgeVariant(level, tx, ty, kind);
  return "single";
}

function edgeVariant(level: Level, tx: number, ty: number, kind: TileKind): TileVariant {
  const row = level.tiles[ty];
  const openL = tx > 0 && row[tx - 1] !== kind;
  const openR = tx < level.width - 1 && row[tx + 1] !== kind;
  if (openL && openR) return "topSolo";
  if (openL) return "topLeft";
  if (openR) return "topRight";
  return "top";
}

/** Well-mixed deterministic hash so decorations don't form visible patterns. */
function tileHash(tx: number, ty: number): number {
  let h = Math.imul(tx, 374761393) + Math.imul(ty, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Center of a tile in world pixels. */
export function tileCenter(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2 };
}

/** Bottom-center of a tile in world pixels — where an entity's feet go. */
export function spawnPoint(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * TILE_SIZE + TILE_SIZE / 2, y: (ty + 1) * TILE_SIZE };
}
