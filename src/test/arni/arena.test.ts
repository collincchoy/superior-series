import { describe, it, expect } from "vitest";
import { arenaGuards, findArena } from "../../lib/arni/arena.js";
import { LEVELS } from "../../lib/arni/level/levels/index.js";
import { trophies } from "../../lib/arni/victory.js";
import { parseLevel } from "../../lib/arni/level/parseLevel.js";
import { TEST_LEVEL } from "../../lib/arni/level/levels/testLevel.js";

describe("findArena", () => {
  it("is null for a level without Rex", () => {
    expect(findArena(parseLevel(["P...", "####"]))).toBeNull();
  });

  it("spans from the gate to the right wall, with Rex's spawn", () => {
    const level = parseLevel([
      "..........#",
      "..........#",
      "P..|....K.#",
      "###########",
    ]);
    expect(findArena(level)).toEqual({
      gateTx: 3,
      leftTx: 4,
      rightTx: 9,
      floorTy: 2,
      rex: { tx: 8, ty: 2 },
    });
  });

  it("requires a gate", () => {
    expect(() => findArena(parseLevel(["P...K.#", "#######"]))).toThrow(/gate/i);
  });

  it("the test level has an arena", () => {
    const a = findArena(parseLevel(TEST_LEVEL));
    expect(a).not.toBeNull();
    expect(a!.rightTx - a!.leftTx).toBeGreaterThanOrEqual(14);
  });
});

describe("arenaGuards", () => {
  it("are the minions placed inside the arena (between the gate and the wall)", () => {
    const level = parseLevel([
      "..........#",
      "..........#",
      "Pg.|.y.b.K#",
      "###########",
    ]);
    expect(arenaGuards(level, findArena(level)!).map((s) => s.kind)).toEqual(["peelback", "bruiser"]);
  });

  it("only the final level seats Rex on the throne, with guards to fight through", () => {
    LEVELS.forEach((def, i) => {
      const level = parseLevel(def.rows);
      const guards = arenaGuards(level, findArena(level)!);
      if (i === LEVELS.length - 1) {
        expect(def.rexOnThrone).toBe(true);
        expect(guards.length).toBeGreaterThanOrEqual(4);
      } else {
        expect(def.rexOnThrone).toBe(false);
        expect(guards).toEqual([]);
      }
    });
  });
});

describe("trophies", () => {
  it("awards Beat Rex always, plus All Eggs and Coin Collector when earned", () => {
    expect(trophies({ coins: 10, eggs: 1, eggsTotal: 3 }, 40)).toEqual({ rex: true, eggs: false, coins: false });
    expect(trophies({ coins: 40, eggs: 3, eggsTotal: 3 }, 40)).toEqual({ rex: true, eggs: true, coins: true });
  });
});
