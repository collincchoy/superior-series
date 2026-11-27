import { describe, it, expect } from "vitest";
import { PLATFORM, platformOffset, platformVelocity } from "../../lib/arni/platforms.js";
import { TILE_SIZE as T } from "../../lib/arni/constants.js";

describe("moving platforms", () => {
  const range = PLATFORM.rangeTiles * T;

  it("start at their spawn position", () => {
    expect(platformOffset("platformH", 0)).toEqual({ dx: 0, dy: 0 });
    expect(platformOffset("platformV", 0)).toEqual({ dx: 0, dy: 0 });
  });

  it("horizontal ones slide right by the full range at half period, then return", () => {
    const half = platformOffset("platformH", PLATFORM.periodMs / 2);
    expect(half.dx).toBeCloseTo(range, 5);
    expect(half.dy).toBe(0);
    expect(platformOffset("platformH", PLATFORM.periodMs).dx).toBeCloseTo(0, 5);
  });

  it("vertical ones rise (negative y) by the full range", () => {
    const half = platformOffset("platformV", PLATFORM.periodMs / 2);
    expect(half.dy).toBeCloseTo(-range, 5);
    expect(half.dx).toBe(0);
  });

  it("platformVelocity is the true rate of change of the offset (px/s)", () => {
    for (const kind of ["platformH", "platformV"] as const) {
      for (let t = 0; t < PLATFORM.periodMs; t += 250) {
        const a = platformOffset(kind, t);
        const b = platformOffset(kind, t + 1);
        const v = platformVelocity(kind, t + 0.5);
        expect(v.vx).toBeCloseTo((b.dx - a.dx) * 1000, 0);
        expect(v.vy).toBeCloseTo((b.dy - a.dy) * 1000, 0);
      }
    }
  });

  it("move smoothly (no jumps between nearby times)", () => {
    for (let t = 0; t < PLATFORM.periodMs; t += 50) {
      const a = platformOffset("platformH", t).dx;
      const b = platformOffset("platformH", t + 16).dx;
      expect(Math.abs(b - a)).toBeLessThan(6);
    }
  });
});
