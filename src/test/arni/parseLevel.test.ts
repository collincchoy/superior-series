import { describe, it, expect } from "vitest";
import {
  parseLevel,
  tileVariant,
  tileCenter,
  spawnPoint,
} from "../../lib/arni/level/parseLevel.js";
import { TILE_SIZE } from "../../lib/arni/constants.js";
import { TEST_LEVEL } from "../../lib/arni/level/levels/testLevel.js";

describe("parseLevel", () => {
  const rows = [
    "..........",
    "...AR.o.E.",
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
    expect(level.tiles[3][4]).toBe("thorns");
    expect(level.tiles[1][3]).toBe("amber");
    expect(level.tiles[1][4]).toBe("boulder");
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

describe("tileVariant", () => {
  const level = parseLevel(["P...", ".##.", ".##.", "####"]);
  const isFill = (v: string) => v === "fill" || v === "fillAccent" || v === "fillCrack";

  it("ground with open sky above is a top tile, rounded on open sides", () => {
    expect(tileVariant(level, 1, 1)).toBe("topLeft");
    expect(tileVariant(level, 2, 1)).toBe("topRight");
    expect(tileVariant(parseLevel(["P#.", "###"]), 1, 0)).toBe("topSolo");
  });

  it("the level's left/right edge counts as continuing ground", () => {
    expect(tileVariant(level, 0, 3)).toBe("top");
    expect(tileVariant(level, 3, 3)).toBe("top");
  });

  it("ground under ground is fill (sometimes with a crystal)", () => {
    expect(isFill(tileVariant(level, 1, 2))).toBe(true);
    expect(isFill(tileVariant(level, 2, 3))).toBe(true);
  });

  it("crystals are deterministic and occasional", () => {
    const big = parseLevel(["P" + ".".repeat(39), ...Array(20).fill("#".repeat(40))]);
    const variants: string[] = [];
    for (let ty = 2; ty < 21; ty++)
      for (let tx = 0; tx < 40; tx++) variants.push(tileVariant(big, tx, ty));
    const share = (v: string) => variants.filter((x) => x === v).length / variants.length;
    expect(share("fillAccent")).toBeGreaterThan(0.03);
    expect(share("fillAccent")).toBeLessThan(0.15);
    expect(share("fillCrack")).toBeGreaterThan(0.1);
    expect(share("fillCrack")).toBeLessThan(0.35);
    expect(share("fill")).toBeGreaterThan(0.5);
    expect(tileVariant(big, 5, 5)).toBe(tileVariant(big, 5, 5));
  });

  it("decorations don't line up in a regular pattern along a row", () => {
    const big = parseLevel(["P" + ".".repeat(59), ...Array(3).fill("#".repeat(60))]);
    const row = Array.from({ length: 60 }, (_, tx) => tileVariant(big, tx, 2));
    const gaps: number[] = [];
    let last = -1;
    row.forEach((v, tx) => {
      if (v !== "fill") {
        if (last >= 0) gaps.push(tx - last);
        last = tx;
      }
    });
    expect(new Set(gaps).size).toBeGreaterThan(2);
  });

  it("branches get end caps", () => {
    const b = parseLevel(["P=.===.", "#######"]);
    expect(tileVariant(b, 1, 0)).toBe("topSolo");
    expect(tileVariant(b, 3, 0)).toBe("topLeft");
    expect(tileVariant(b, 4, 0)).toBe("top");
    expect(tileVariant(b, 5, 0)).toBe("topRight");
  });

  it("other tiles are 'single'", () => {
    const o = parseLevel(["PARX^", "#####"]);
    for (let tx = 1; tx <= 4; tx++) expect(tileVariant(o, tx, 0)).toBe("single");
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
