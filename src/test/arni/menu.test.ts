import { describe, it, expect } from "vitest";
import { PAUSE_OPTIONS, moveSelection } from "../../lib/arni/menu.js";

describe("pause menu", () => {
  it("offers resume, restart from checkpoint, and restart level — resume first", () => {
    expect(PAUSE_OPTIONS.map((o) => o.id)).toEqual(["resume", "checkpoint", "restart"]);
  });

  it("moves selection and wraps around", () => {
    expect(moveSelection(0, 1, 3)).toBe(1);
    expect(moveSelection(2, 1, 3)).toBe(0);
    expect(moveSelection(0, -1, 3)).toBe(2);
  });
});
