import { describe, it, expect } from "vitest";
import { addCoins, collectEgg, initialScore } from "../../lib/arni/pickups.js";
import { parseLevel } from "../../lib/arni/level/parseLevel.js";

describe("score", () => {
  const level = parseLevel(["P.o.E..E", "########"]);

  it("starts empty and knows how many eggs are hidden in the level", () => {
    expect(initialScore(level)).toEqual({ coins: 0, eggs: 0, eggsTotal: 2 });
  });

  it("adds coins", () => {
    expect(addCoins(initialScore(level), 3).coins).toBe(3);
  });

  it("collects eggs up to the total", () => {
    let s = collectEgg(initialScore(level));
    s = collectEgg(s);
    s = collectEgg(s);
    expect(s.eggs).toBe(2);
  });
});
