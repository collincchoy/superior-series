import { TILE_SIZE } from "../constants.js";
import {
  EMPTY_CHARS,
  PLAYER_START_CHAR,
  SPAWN_CHARS,
  TILE_CHARS,
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
}

export type GroundVariant = "top" | "fill";

/** Parse an ASCII level (one string per row, top to bottom). Throws on invalid input. */
export function parseLevel(rows: readonly string[]): Level {
  if (rows.length === 0) throw new Error("Level has no rows");
  const width = rows[0].length;
  const tiles: (TileKind | null)[][] = [];
  const spawns: Spawn[] = [];
  const starts: TilePos[] = [];

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

  return { width, height: rows.length, tiles, spawns, playerStart: starts[0] };
}

/** Ground tiles with nothing solid on top get the grassy "top" texture. */
export function groundVariant(
  level: Level,
  tx: number,
  ty: number,
): GroundVariant {
  return ty > 0 && level.tiles[ty - 1][tx] === "ground" ? "fill" : "top";
}

/** Center of a tile in world pixels. */
export function tileCenter(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2 };
}

/** Bottom-center of a tile in world pixels — where an entity's feet go. */
export function spawnPoint(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * TILE_SIZE + TILE_SIZE / 2, y: (ty + 1) * TILE_SIZE };
}
