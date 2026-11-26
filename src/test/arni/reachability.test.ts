import { describe, it, expect } from "vitest";
import { parseLevel } from "../../lib/arni/level/parseLevel.js";
import {
  jumpReach,
  reachableCells,
  unreachableThings,
  type JumpReach,
} from "../../lib/arni/level/reachability.js";
import { TEST_LEVEL } from "../../lib/arni/level/levels/testLevel.js";

const REACH: JumpReach = { rise: 2, chargedRise: 4, across: 4, grabRise: 3, bonkRise: 4, springRise: 6 };
const key = (tx: number, ty: number) => `${tx},${ty}`;

describe("jumpReach (derived from tuning)", () => {
  it("normal jump climbs 2 tiles, charged jump 4, and crosses a 3-tile gap", () => {
    const r = jumpReach();
    expect(r.rise).toBe(2);
    expect(r.chargedRise).toBe(4);
    expect(r.across).toBeGreaterThanOrEqual(4);
  });

  it("a bounce mushroom launches higher than a charged jump", () => {
    expect(jumpReach().springRise).toBeGreaterThan(jumpReach().chargedRise);
  });
});

describe("level gadgets", () => {
  it("bounce mushrooms reach ledges too high to jump", () => {
    const rows = ["....", "..##", "..##", "..##", "..##", "..##", "PU##", "####"];
    expect(reachableCells(parseLevel(rows), REACH).has(key(2, 0))).toBe(true);
    const noMushroom = rows.map((r) => r.replace("U", "#"));
    noMushroom[6] = "P.##";
    expect(reachableCells(parseLevel(noMushroom), REACH).has(key(2, 0))).toBe(false);
  });

  it("a moving platform carries Arni across a wide lava pool", () => {
    const rows = [
      "............",
      "P.H.......E.",
      "##~~~~~~~~##",
    ];
    expect(unreachableThings(parseLevel(rows), REACH)).toEqual([]);
    const without = rows.map((r) => r.replace("H", "."));
    expect(unreachableThings(parseLevel(without), REACH)).toEqual([{ what: "egg", tx: 10, ty: 1 }]);
  });

  it("a rising platform lifts Arni to a high ledge", () => {
    const rows = [
      "...E",
      "...#",
      "...#",
      "...#",
      "...#",
      "...#",
      "P.V#",
      "####",
    ];
    expect(unreachableThings(parseLevel(rows), REACH)).toEqual([]);
  });
});

describe("reachableCells", () => {
  it("includes the start and flat ground", () => {
    const level = parseLevel(["P....", "#####"]);
    const cells = reachableCells(level, REACH);
    expect(cells.has(key(0, 0))).toBe(true);
    expect(cells.has(key(4, 0))).toBe(true);
  });

  /** A wall of `height` tiles at col 2; returns whether its top is reachable. */
  const canClimb = (height: number) => {
    const rows = [".".repeat(3)];
    for (let i = 0; i < height; i++) rows.push(i === height - 1 ? "P.#" : "..#");
    rows.push("###");
    return reachableCells(parseLevel(rows), REACH).has(key(2, 0));
  };

  it("climbs a 2-tile ledge with a normal jump", () => {
    expect(canClimb(2)).toBe(true);
  });

  it("climbs a 4-tile ledge only thanks to the charged jump", () => {
    expect(canClimb(4)).toBe(true);
    expect(reachableCells(parseLevel(["...", "..#", "..#", "..#", "P.#", "###"]), { ...REACH, chargedRise: 2 }).has(key(2, 0))).toBe(false);
  });

  it("cannot climb a 5-tile ledge", () => {
    expect(canClimb(5)).toBe(false);
  });

  it("stands on one-way branches", () => {
    const level = parseLevel([".....", "..===", ".....", "P....", "#####"]);
    expect(reachableCells(level, REACH).has(key(3, 0))).toBe(true);
  });

  it("does not stand on thorns", () => {
    const level = parseLevel(["P.....", "##^^##"]);
    const cells = reachableCells(level, REACH);
    expect(cells.has(key(2, 0))).toBe(false);
    expect(cells.has(key(4, 0))).toBe(true); // jumped over
  });

  it("can't cross a gap wider than its reach", () => {
    const level = parseLevel(["P.........", "##.......#"]);
    expect(reachableCells(level, REACH).has(key(9, 0))).toBe(false);
  });
});

describe("unreachableThings", () => {
  it("flags a coin too high to grab", () => {
    const level = parseLevel(["..o.", "....", "....", "....", "....", "P...", "####"]);
    expect(unreachableThings(level, REACH)).toEqual([
      { what: "coin", tx: 2, ty: 0 },
    ]);
  });

  it("accepts a coin within jump height", () => {
    const level = parseLevel(["..o.", "....", "P...", "####"]);
    expect(unreachableThings(level, REACH)).toEqual([]);
  });

  it("flags an amber block too high to bonk from below", () => {
    const level = parseLevel(["..A.", "....", "....", "....", "....", "P...", "####"]);
    expect(unreachableThings(level, REACH)).toEqual([
      { what: "amber", tx: 2, ty: 0 },
    ]);
  });

  it("flags an enemy standing on an unreachable ledge", () => {
    const level = parseLevel([
      "....g.",
      "...###",
      "......",
      "......",
      "......",
      "......",
      "P.....",
      "######",
    ]);
    expect(unreachableThings(level, REACH)).toEqual([
      { what: "bunchling", tx: 4, ty: 0 },
    ]);
  });
});

describe("TEST_LEVEL", () => {
  it("every coin, egg, enemy, checkpoint and amber block can be reached", () => {
    const level = parseLevel(TEST_LEVEL);
    expect(unreachableThings(level, jumpReach())).toEqual([]);
  });
});
