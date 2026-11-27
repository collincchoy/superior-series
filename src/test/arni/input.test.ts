import { describe, it, expect } from "vitest";
import {
  ACTIONS,
  KEYBOARD_BINDINGS,
  emptyInput,
  inputFromPressed,
} from "../../lib/arni/input.js";

describe("keyboard bindings", () => {
  it("binds at least one key to every action", () => {
    for (const action of ACTIONS) {
      expect(KEYBOARD_BINDINGS[action].length, action).toBeGreaterThan(0);
    }
  });

  it("never binds the same key to two actions", () => {
    const seen = new Map<string, string>();
    for (const action of ACTIONS) {
      for (const key of KEYBOARD_BINDINGS[action]) {
        expect(seen.get(key), `${key} bound twice`).toBeUndefined();
        seen.set(key, action);
      }
    }
  });
});

describe("inputFromPressed", () => {
  it("is all false when nothing is pressed", () => {
    expect(inputFromPressed(() => false)).toEqual(emptyInput());
  });

  it("sets an action when any of its keys is pressed", () => {
    const input = inputFromPressed((key) => key === "D" || key === "SPACE");
    expect(input.right).toBe(true);
    expect(input.jump).toBe(true);
    expect(input.left).toBe(false);
  });
});
