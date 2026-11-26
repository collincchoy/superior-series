import { describe, it, expect } from "vitest";
import { parseLevel } from "../../lib/arni/level/parseLevel.js";
import {
  AMBER_COINS,
  bonkTile,
  breakTile,
  hitAmber,
  tilesInRect,
  whipTargets,
  withTile,
} from "../../lib/arni/blocks.js";
import { TILE_SIZE as T } from "../../lib/arni/constants.js";

const level = () =>
  parseLevel([
    "..A.X.",
    "......",
    "P.R.a.",
    "######",
  ]);

describe("tilesInRect", () => {
  it("lists tiles overlapping a pixel rect", () => {
    const hits = tilesInRect(level(), { left: 2 * T + 1, top: 2 * T + 1, right: 3 * T - 1, bottom: 4 * T - 1 });
    expect(hits).toEqual([
      { tx: 2, ty: 2, kind: "boulder" },
      { tx: 2, ty: 3, kind: "ground" },
    ]);
  });
});

describe("whipTargets", () => {
  it("only returns breakables and amber — not ground or spent amber", () => {
    const rect = { left: 0, top: 0, right: 6 * T, bottom: 4 * T };
    expect(whipTargets(level(), rect).map((t) => t.kind).sort()).toEqual(["amber", "boulder", "crate"]);
  });
});

describe("breakTile", () => {
  it("removes a breakable tile without mutating the original level", () => {
    const before = level();
    const after = breakTile(before, 2, 2);
    expect(after.tiles[2][2]).toBeNull();
    expect(before.tiles[2][2]).toBe("boulder");
  });

  it("refuses to break non-breakable tiles", () => {
    const l = level();
    expect(breakTile(l, 0, 3)).toBe(l);
  });
});

describe("withTile", () => {
  it("sets a tile (e.g. crumbly rock falling / regrowing) without mutating", () => {
    const before = level();
    const gone = withTile(before, 0, 3, null);
    expect(gone.tiles[3][0]).toBeNull();
    expect(before.tiles[3][0]).toBe("ground");
    expect(withTile(gone, 0, 3, "crumble").tiles[3][0]).toBe("crumble");
  });
});

describe("hitAmber", () => {
  it("turns amber spent and rewards coins", () => {
    const { level: after, reward } = hitAmber(level(), 2, 0);
    expect(after.tiles[0][2]).toBe("spent");
    expect(reward).toEqual({ coins: AMBER_COINS });
  });

  it("spent amber gives nothing", () => {
    const l = level();
    const r = hitAmber(l, 4, 2);
    expect(r.level).toBe(l);
    expect(r.reward).toBeNull();
  });
});

describe("bonkTile (head hits a block from below)", () => {
  it("finds the tile right above Arni's head when rising", () => {
    const l = parseLevel(["..A...", "......", "P.....", "######"]);
    const arni = { left: 2 * T + 10, top: T + 2, right: 2 * T + 54, bottom: 3 * T };
    expect(bonkTile(l, arni, -300)).toEqual({ tx: 2, ty: 0, kind: "amber" });
  });

  it("uses the tile nearest Arni's center when straddling two", () => {
    const l = parseLevel([".AX...", "......", "P.....", "######"]);
    const arni = { left: T + 50, top: T + 2, right: 2 * T + 30, bottom: 3 * T }; // center 136 → nearer tile 2 (160) than tile 1 (96)
    expect(bonkTile(l, arni, -300)?.tx).toBe(2);
  });

  it("is null when falling or when nothing is above", () => {
    const l = parseLevel(["..A...", "......", "P.....", "######"]);
    const arni = { left: 2 * T + 10, top: T + 2, right: 2 * T + 54, bottom: 3 * T };
    expect(bonkTile(l, arni, 300)).toBeNull();
    expect(bonkTile(l, { ...arni, left: 4 * T, right: 4 * T + 44 }, -300)).toBeNull();
  });
});
