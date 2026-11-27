import { describe, it, expect } from "vitest";
import { BOSS, bossConfig, bossHit, initialBoss, stepBoss } from "../../lib/arni/boss.js";

describe("bossConfig — Rex gets tougher every level", () => {
  const all = Array.from({ length: 10 }, (_, i) => bossConfig(i + 1));

  it("level 1 is a 1-hit warm-up, level 2 two hits, then the full 3-phase fight", () => {
    expect(bossConfig(1).hits).toBe(1);
    expect(bossConfig(2).hits).toBe(2);
    for (let d = 3; d <= 10; d++) expect(bossConfig(d).hits).toBe(3);
  });

  it("never gets easier from one level to the next", () => {
    for (let i = 1; i < all.length; i++) {
      const [a, b] = [all[i - 1], all[i]];
      expect(b.phases[1].volley).toBeGreaterThanOrEqual(a.phases[1].volley);
      expect(b.phases[1].throwEveryMs).toBeLessThanOrEqual(a.phases[1].throwEveryMs);
      expect(b.phases[2].chargeSpeed).toBeGreaterThanOrEqual(a.phases[2].chargeSpeed);
      expect(b.phases[3].summon).toBeGreaterThanOrEqual(a.phases[3].summon);
      for (const p of [1, 2, 3] as const) expect(b.phases[p].dizzyMs).toBeLessThanOrEqual(a.phases[p].dizzyMs);
    }
  });

  it("the final fight is clearly harder than the first", () => {
    const [first, last] = [bossConfig(1), bossConfig(10)];
    expect(last.phases[1].dizzyMs).toBeLessThan(first.phases[1].dizzyMs * 0.75);
    expect(last.phases[3].chargeSpeed).toBeGreaterThan(first.phases[3].chargeSpeed);
  });

  it("but Rex is always beatable: dizzy windows stay generous for kids", () => {
    for (const c of all) for (const p of [1, 2, 3] as const) expect(c.phases[p].dizzyMs).toBeGreaterThanOrEqual(1800);
  });

  it("the default config is the standard (level-3) fight", () => {
    expect(BOSS).toEqual(bossConfig(3));
  });

  it("a 1-hit Rex is defeated by the first dizzy hit", () => {
    let s = initialBoss(bossConfig(1));
    for (let i = 0; i < 2000 && s.mode !== "dizzy"; i++) {
      s = stepBoss(s, { arniDx: -300, arniDy: 0, wallAhead: false, grounded: true }, 1000 / 60).state;
    }
    expect(s.mode).toBe("dizzy");
    expect(bossHit(s).result).toBe("defeated");
  });
});
