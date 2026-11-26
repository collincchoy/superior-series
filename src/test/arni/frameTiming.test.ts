import { describe, it, expect } from "vitest";
import { logicDeltaMs, PHYSICS_FPS } from "../../lib/arni/frameTiming.js";

describe("logicDeltaMs", () => {
  it("is 0 when physics didn't step this frame (high-refresh screens) — skip game logic", () => {
    // Contact flags (on the ground, hit the mushroom…) are stale on such frames;
    // running logic then cancelled jumps and re-triggered the mushroom every frame.
    expect(logicDeltaMs(0)).toBe(0);
  });

  it("covers exactly the physics time that elapsed", () => {
    expect(logicDeltaMs(1)).toBeCloseTo(1000 / PHYSICS_FPS, 6);
    expect(logicDeltaMs(2)).toBeCloseTo(2000 / PHYSICS_FPS, 6);
  });

  it("uses the physics world's actual rate when given", () => {
    expect(logicDeltaMs(1, 60)).toBeCloseTo(1000 / 60, 6);
  });

  it("is capped so a long hitch can't launch Arni through floors", () => {
    expect(logicDeltaMs(100)).toBe(50);
  });

  it("physics runs at least as fast as a 120Hz screen", () => {
    expect(PHYSICS_FPS).toBeGreaterThanOrEqual(120);
  });
});
