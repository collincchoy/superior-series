import { describe, it, expect } from "vitest";
import { LEVELS } from "../../lib/arni/level/levels/index.js";
import { parseLevel } from "../../lib/arni/level/parseLevel.js";
import { jumpReach, unreachableThings } from "../../lib/arni/level/reachability.js";
import { findArena } from "../../lib/arni/arena.js";
import { isEnemyKind } from "../../lib/arni/combat.js";

describe("the 10 levels", () => {
  it("there are exactly 10, numbered 1..10 with difficulty 1..10", () => {
    expect(LEVELS).toHaveLength(10);
    LEVELS.forEach((l, i) => {
      expect(l.number).toBe(i + 1);
      expect(l.difficulty).toBe(i + 1);
    });
  });

  it("levels 1–5 are in the volcano, 6–10 in Rex's banana factory", () => {
    expect(LEVELS.slice(0, 5).every((l) => l.theme === "volcano")).toBe(true);
    expect(LEVELS.slice(5).every((l) => l.theme === "factory")).toBe(true);
  });

  for (const def of LEVELS) {
    describe(`Level ${def.number}: ${def.name}`, () => {
      const level = parseLevel(def.rows);

      it("parses", () => {
        expect(level.width).toBeGreaterThan(60);
      });

      it("has exactly 3 hidden eggs", () => {
        expect(level.spawns.filter((s) => s.kind === "egg")).toHaveLength(3);
      });

      it("ends with Rex's arena", () => {
        const arena = findArena(level);
        expect(arena).not.toBeNull();
        expect(arena!.rightTx - arena!.leftTx).toBeGreaterThanOrEqual(14);
      });

      it("everything can be reached", () => {
        expect(unreachableThings(level, jumpReach())).toEqual([]);
      });

      it("has at least one checkpoint", () => {
        expect(level.spawns.some((s) => s.kind === "checkpoint")).toBe(true);
      });
    });
  }

  it("difficulty ramps: later levels have more minions and are longer", () => {
    const stats = LEVELS.map((d) => {
      const l = parseLevel(d.rows);
      return { width: l.width, minions: l.spawns.filter((s) => isEnemyKind(s.kind)).length };
    });
    const firstHalf = stats.slice(0, 5);
    const secondHalf = stats.slice(5);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(secondHalf.map((s) => s.minions))).toBeGreaterThan(avg(firstHalf.map((s) => s.minions)));
    expect(stats[9].minions).toBeGreaterThan(stats[0].minions * 2);
    expect(stats[9].width).toBeGreaterThan(stats[0].width);
  });

  it("flying crowns only appear in later levels, and get more common", () => {
    const crowns = LEVELS.map((d) => parseLevel(d.rows).spawns.filter((s) => s.kind === "crownie").length);
    expect(crowns.slice(0, 6).every((n) => n === 0)).toBe(true);
    expect(crowns.slice(6).every((n) => n > 0)).toBe(true);
    for (let i = 7; i < 10; i++) expect(crowns[i]).toBeGreaterThanOrEqual(crowns[i - 1]);
  });

  it("each level has a distinct name", () => {
    expect(new Set(LEVELS.map((l) => l.name)).size).toBe(10);
  });
});
