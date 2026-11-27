import { describe, it, expect } from "vitest";
import {
  damageEnemy,
  enemyMaxHp,
  newEnemy,
  overlaps,
  resolveEnemyContact,
  whipHitbox,
  type Rect,
} from "../../lib/arni/combat.js";
import { TUNING as T } from "../../lib/arni/tuning.js";

const rect = (left: number, top: number, w: number, h: number): Rect => ({
  left,
  top,
  right: left + w,
  bottom: top + h,
});

describe("overlaps", () => {
  it("is true for intersecting rects", () => {
    expect(overlaps(rect(0, 0, 10, 10), rect(5, 5, 10, 10))).toBe(true);
  });
  it("is false for rects that only touch", () => {
    expect(overlaps(rect(0, 0, 10, 10), rect(10, 0, 10, 10))).toBe(false);
  });
});

describe("whipHitbox (spin attack)", () => {
  const body = rect(100, 100, 44, 78);
  const hb = whipHitbox(body);

  it("reaches past the body on both sides", () => {
    expect(hb.left).toBe(body.left - T.whipReach);
    expect(hb.right).toBe(body.right + T.whipReach);
  });

  it("reaches further with a reach multiplier (sword)", () => {
    const sword = whipHitbox(body, 2);
    expect(sword.left).toBe(body.left - T.whipReach * 2);
    expect(sword.right).toBe(body.right + T.whipReach * 2);
  });

  it("sweeps Arni's whole height, reaching just above the head", () => {
    // So a block at head height (e.g. a crate wall) gets hit too.
    expect(hb.top).toBeLessThan(body.top);
    expect(hb.top).toBeGreaterThanOrEqual(body.top - 12);
    expect(hb.bottom).toBeLessThanOrEqual(body.bottom);
    expect(hb.bottom).toBeGreaterThan(body.bottom - 8);
  });
});

describe("resolveEnemyContact", () => {
  const enemy = rect(200, 300, 50, 70);

  it("falling onto an enemy's head is a stomp", () => {
    const arni = rect(190, 236, 44, 78); // bottom 314, overlapping head
    expect(
      resolveEnemyContact({ arni, arniPrevBottom: 298, arniVy: 400, whip: null, enemy }),
    ).toBe("stomp");
  });

  it("walking into an enemy hurts Arni", () => {
    const arni = rect(160, 292, 44, 78);
    expect(
      resolveEnemyContact({ arni, arniPrevBottom: 370, arniVy: 60, whip: null, enemy }),
    ).toBe("hurt");
  });

  it("jumping up into an enemy from below hurts", () => {
    const arni = rect(200, 360, 44, 78);
    expect(
      resolveEnemyContact({ arni, arniPrevBottom: 450, arniVy: -500, whip: null, enemy }),
    ).toBe("hurt");
  });

  it("a whip that reaches the enemy hits it, even without body contact", () => {
    const arni = rect(120, 292, 44, 78);
    expect(
      resolveEnemyContact({ arni, arniPrevBottom: 370, arniVy: 60, whip: whipHitbox(arni), enemy }),
    ).toBe("whip");
  });

  it("whip wins over body contact", () => {
    const arni = rect(170, 292, 44, 78);
    expect(
      resolveEnemyContact({ arni, arniPrevBottom: 370, arniVy: 60, whip: whipHitbox(arni), enemy }),
    ).toBe("whip");
  });

  it("no contact at all is none", () => {
    const arni = rect(0, 292, 44, 78);
    expect(
      resolveEnemyContact({ arni, arniPrevBottom: 370, arniVy: 60, whip: null, enemy }),
    ).toBe("none");
  });
});

describe("enemies", () => {
  it("bruisers take 2 hits, everyone else 1", () => {
    expect(enemyMaxHp("bruiser")).toBe(2);
    for (const k of ["bunchling", "peelback", "spotter", "mush", "crownie"] as const) {
      expect(enemyMaxHp(k)).toBe(1);
    }
  });

  it("damage reduces hp and defeats at zero", () => {
    let e = newEnemy("bruiser");
    e = damageEnemy(e);
    expect(e.hp).toBe(1);
    expect(e.defeated).toBe(false);
    e = damageEnemy(e);
    expect(e.defeated).toBe(true);
  });

  it("a 2-damage sword hit defeats a bruiser at once", () => {
    expect(damageEnemy(newEnemy("bruiser"), 2).defeated).toBe(true);
  });

  it("defeated enemies stay defeated", () => {
    const e = damageEnemy(damageEnemy(newEnemy("bunchling")));
    expect(e.hp).toBe(0);
    expect(e.defeated).toBe(true);
  });
});
