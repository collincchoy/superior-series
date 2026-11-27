import { describe, it, expect } from "vitest";
import { inputFromTouches, mergeInputs, TOUCH_BUTTONS, touchButtonAt } from "../../lib/arni/touch.js";
import { emptyInput } from "../../lib/arni/input.js";
import { VIEW_HEIGHT, VIEW_WIDTH } from "../../lib/arni/constants.js";

const center = (id: string) => {
  const b = TOUCH_BUTTONS.find((x) => x.id === id)!;
  return { x: b.x, y: b.y };
};

describe("touch button layout", () => {
  it("has left, right, down, jump, whip and fire buttons", () => {
    expect(TOUCH_BUTTONS.map((b) => b.id).sort()).toEqual(["attack", "down", "jump", "left", "right", "special"]);
  });

  it("every button is fully on screen", () => {
    for (const b of TOUCH_BUTTONS) {
      expect(b.x - b.r, b.id).toBeGreaterThanOrEqual(0);
      expect(b.x + b.r, b.id).toBeLessThanOrEqual(VIEW_WIDTH);
      expect(b.y - b.r, b.id).toBeGreaterThanOrEqual(0);
      expect(b.y + b.r, b.id).toBeLessThanOrEqual(VIEW_HEIGHT);
    }
  });

  it("buttons are big enough for small thumbs (≥ ~100px across on the 1280-wide screen)", () => {
    for (const b of TOUCH_BUTTONS) expect(b.r * 2, b.id).toBeGreaterThanOrEqual(100);
  });

  it("movement is on the left half, actions on the right half", () => {
    for (const id of ["left", "right", "down"]) expect(center(id).x).toBeLessThan(VIEW_WIDTH / 2);
    for (const id of ["jump", "attack", "special"]) expect(center(id).x).toBeGreaterThan(VIEW_WIDTH / 2);
  });

  it("the forgiving touch areas never overlap, so a touch means exactly one button", () => {
    for (const a of TOUCH_BUTTONS) {
      for (const b of TOUCH_BUTTONS) {
        if (a === b) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.id}/${b.id}`).toBeGreaterThan(a.hitR + b.hitR);
      }
    }
  });

  it("jump is the biggest button", () => {
    const jump = TOUCH_BUTTONS.find((b) => b.id === "jump")!;
    for (const b of TOUCH_BUTTONS) expect(jump.r).toBeGreaterThanOrEqual(b.r);
  });
});

describe("touchButtonAt", () => {
  it("finds the button under a touch, with a little forgiveness past the edge", () => {
    const left = TOUCH_BUTTONS.find((b) => b.id === "left")!;
    expect(touchButtonAt(left.x, left.y)?.id).toBe("left");
    expect(touchButtonAt(left.x, left.y - left.r - 6)?.id).toBe("left");
  });

  it("is null in the open middle of the screen", () => {
    expect(touchButtonAt(VIEW_WIDTH / 2, VIEW_HEIGHT / 2)).toBeNull();
  });
});

describe("inputFromTouches", () => {
  it("no fingers, no input", () => {
    expect(inputFromTouches([])).toEqual(emptyInput());
  });

  it("several fingers press several buttons (run + jump, or crouch + jump for the super jump)", () => {
    const i = inputFromTouches([center("right"), center("jump")]);
    expect(i.right).toBe(true);
    expect(i.jump).toBe(true);
    const s = inputFromTouches([center("down"), center("jump")]);
    expect(s.down && s.jump).toBe(true);
  });

  it("a thumb sliding from ◀ to ▶ switches direction without lifting", () => {
    expect(inputFromTouches([center("left")]).left).toBe(true);
    const moved = inputFromTouches([center("right")]);
    expect(moved.right).toBe(true);
    expect(moved.left).toBe(false);
  });

  it("the fire button only works while the fire power is active", () => {
    expect(inputFromTouches([center("special")], { fireEnabled: false }).special).toBe(false);
    expect(inputFromTouches([center("special")], { fireEnabled: true }).special).toBe(true);
  });
});

describe("mergeInputs", () => {
  it("keyboard and touch both count", () => {
    const kb = { ...emptyInput(), left: true };
    const touch = { ...emptyInput(), jump: true };
    expect(mergeInputs(kb, touch)).toEqual({ ...emptyInput(), left: true, jump: true });
  });
});
