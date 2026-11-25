import { describe, it, expect } from "vitest";
import {
  parseLevel,
  groundVariant,
  tileCenter,
  spawnPoint,
} from "../../lib/arni/level/parseLevel.js";
import { TILE_SIZE } from "../../lib/arni/constants.js";
import { TEST_LEVEL } from "../../lib/arni/level/levels/testLevel.js";

describe("parseLevel", () => {
  const rows = [
    "..........",
    "...?B.o.E.",
    "P.....C..g",
    "####^^####",
    "##########",
  ];

  it("reports width and height in tiles", () => {
    const level = parseLevel(rows);
    expect(level.width).toBe(10);
    expect(level.height).toBe(5);
  });

  it("places solid and hazard tiles in the grid", () => {
    const level = parseLevel(rows);
    expect(level.tiles[3][0]).toBe("ground");
    expect(level.tiles[3][4]).toBe("spikes");
    expect(level.tiles[1][3]).toBe("question");
    expect(level.tiles[1][4]).toBe("brick");
    expect(level.tiles[0][0]).toBeNull();
  });

  it("does not put entities in the tile grid", () => {
    const level = parseLevel(rows);
    expect(level.tiles[2][0]).toBeNull(); // player start
    expect(level.tiles[1][6]).toBeNull(); // coin
  });

  it("finds the player start", () => {
    expect(parseLevel(rows).playerStart).toEqual({ tx: 0, ty: 2 });
  });

  it("collects entity spawns in reading order", () => {
    const { spawns } = parseLevel(rows);
    expect(spawns).toEqual([
      { kind: "coin", tx: 6, ty: 1 },
      { kind: "egg", tx: 8, ty: 1 },
      { kind: "checkpoint", tx: 6, ty: 2 },
      { kind: "bunchling", tx: 9, ty: 2 },
    ]);
  });

  it("parses every banana minion variant", () => {
    const { spawns } = parseLevel(["Pgybsm", "######"]);
    expect(spawns.map((s) => s.kind)).toEqual([
      "bunchling",
      "peelback",
      "bruiser",
      "spotter",
      "mush",
    ]);
  });

  it("treats spaces as empty", () => {
    const level = parseLevel(["P  ", "###"]);
    expect(level.tiles[0][1]).toBeNull();
  });

  it("rejects rows of different lengths with the row number", () => {
    expect(() => parseLevel(["P...", "###"])).toThrow(/row 2/i);
  });

  it("rejects unknown characters with their position", () => {
    expect(() => parseLevel(["P.Z.", "####"])).toThrow(/'Z'.*row 1.*col 3/i);
  });

  it("requires exactly one player start", () => {
    expect(() => parseLevel(["....", "####"])).toThrow(/player start/i);
    expect(() => parseLevel(["P..P", "####"])).toThrow(/player start/i);
  });
});

describe("groundVariant", () => {
  const level = parseLevel(["P...", ".##.", ".##.", "####"]);

  it("is 'top' when nothing solid is above", () => {
    expect(groundVariant(level, 1, 1)).toBe("top");
    expect(groundVariant(level, 0, 3)).toBe("top");
  });

  it("is 'fill' when ground is directly above", () => {
    expect(groundVariant(level, 1, 2)).toBe("fill");
    expect(groundVariant(level, 2, 3)).toBe("fill");
  });

  it("is 'top' on the first row", () => {
    const top = parseLevel(["#P", "##"]);
    expect(groundVariant(top, 0, 0)).toBe("top");
  });
});

describe("coordinates", () => {
  it("tileCenter is the middle of the tile in world pixels", () => {
    expect(tileCenter(0, 0)).toEqual({ x: TILE_SIZE / 2, y: TILE_SIZE / 2 });
    expect(tileCenter(3, 2)).toEqual({
      x: 3 * TILE_SIZE + TILE_SIZE / 2,
      y: 2 * TILE_SIZE + TILE_SIZE / 2,
    });
  });

  it("spawnPoint is bottom-center of the tile (where feet go)", () => {
    expect(spawnPoint(3, 2)).toEqual({
      x: 3 * TILE_SIZE + TILE_SIZE / 2,
      y: 3 * TILE_SIZE,
    });
  });
});

describe("TEST_LEVEL", () => {
  it("parses without errors", () => {
    expect(() => parseLevel(TEST_LEVEL)).not.toThrow();
  });

  it("has solid ground under the player start", () => {
    const level = parseLevel(TEST_LEVEL);
    const { tx, ty } = level.playerStart;
    expect(level.tiles[ty + 1][tx]).toBe("ground");
  });
});
