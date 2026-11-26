import { describe, it, expect } from "vitest";
import { parseLevel } from "../../lib/arni/level/parseLevel.js";
import { groundAhead, isSolidTile, rectHitsSolid, wallAhead } from "../../lib/arni/level/collision.js";
import { TILE_SIZE as T } from "../../lib/arni/constants.js";

// Row 1 has a one-tile-high tunnel under the roof at cols 2–3.
const level = parseLevel([
  "..##..",
  "P.....",
  "######",
]);

describe("isSolidTile", () => {
  it("is true for tiles and false for empty cells", () => {
    expect(isSolidTile(level, 2, 0)).toBe(true);
    expect(isSolidTile(level, 0, 1)).toBe(false);
  });

  it("one-way branches are not solid (Arni can stand up through them)", () => {
    const b = parseLevel(["P=", "##"]);
    expect(isSolidTile(b, 1, 0)).toBe(false);
  });

  it("treats outside the level as empty (above/below) and solid at the sides", () => {
    expect(isSolidTile(level, 0, -1)).toBe(false);
    expect(isSolidTile(level, 0, 99)).toBe(false);
    expect(isSolidTile(level, -1, 1)).toBe(true);
    expect(isSolidTile(level, 6, 1)).toBe(true);
  });
});

describe("rectHitsSolid", () => {
  it("detects overlap with a solid tile", () => {
    expect(rectHitsSolid(level, 2 * T + 4, 0, 2 * T + 20, T / 2)).toBe(true);
  });

  it("is false in open air", () => {
    expect(rectHitsSolid(level, 4, T + 4, T - 4, 2 * T - 4)).toBe(false);
  });

  it("edges that only touch a tile do not count as overlap", () => {
    // Rect sits exactly on top of the floor row (bottom edge == floor top).
    expect(rectHitsSolid(level, 4, T, T - 4, 2 * T)).toBe(false);
  });
});

describe("enemy senses", () => {
  //   cols: 0123456
  const l = parseLevel([
    "P......",
    "....#..",
    "###.###",
  ]);
  // A walker 40px wide standing on row 2's floor (feet at y = 2*T).
  const feet = 2 * T;

  it("groundAhead sees floor in front, and the gap at col 3", () => {
    expect(groundAhead(l, 1.5 * T, feet, 1, 20)).toBe(true);
    expect(groundAhead(l, 2.5 * T, feet, 1, 20)).toBe(false); // next step is the gap
    expect(groundAhead(l, 4.5 * T, feet, -1, 20)).toBe(false);
  });

  it("counts one-way branches as ground", () => {
    const b = parseLevel(["P...", "##=#"]);
    expect(groundAhead(b, 1.5 * T, T, 1, 20)).toBe(true);
  });

  it("does not count hazards as ground", () => {
    const h = parseLevel(["P...", "##^#"]);
    expect(groundAhead(h, 1.5 * T, T, 1, 20)).toBe(false);
  });

  it("wallAhead sees a solid tile at body height in front", () => {
    expect(wallAhead(l, 3.5 * T, feet, 50, 1, 20)).toBe(true); // block at col 4 row 1
    expect(wallAhead(l, 1.5 * T, feet, 50, 1, 20)).toBe(false);
  });

  it("the level edge is a wall", () => {
    expect(wallAhead(l, 0.4 * T, feet, 50, -1, 20)).toBe(true);
  });
});
