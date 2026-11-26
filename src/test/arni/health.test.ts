import { describe, it, expect } from "vitest";
import {
  damage,
  hasBonusHeart,
  heal,
  initialHealth,
  isInvulnerable,
  respawnHealth,
  tickHealth,
} from "../../lib/arni/health.js";
import { TUNING as T } from "../../lib/arni/tuning.js";

describe("health", () => {
  it("starts with full hearts", () => {
    const h = initialHealth();
    expect(h.hearts).toBe(T.maxHearts);
    expect(h.maxHearts).toBe(T.maxHearts);
    expect(isInvulnerable(h)).toBe(false);
  });

  it("taking damage loses a heart and grants brief invulnerability", () => {
    const { health, result } = damage(initialHealth());
    expect(result).toBe("hurt");
    expect(health.hearts).toBe(T.maxHearts - 1);
    expect(isInvulnerable(health)).toBe(true);
  });

  it("ignores damage while invulnerable", () => {
    const once = damage(initialHealth()).health;
    const { health, result } = damage(once);
    expect(result).toBe("ignored");
    expect(health.hearts).toBe(once.hearts);
  });

  it("invulnerability wears off over time", () => {
    let h = damage(initialHealth()).health;
    h = tickHealth(h, T.invulnMs - 1);
    expect(isInvulnerable(h)).toBe(true);
    h = tickHealth(h, 2);
    expect(isInvulnerable(h)).toBe(false);
  });

  it("losing the last heart is 'dead'", () => {
    let h = initialHealth();
    for (let i = 0; i < T.maxHearts - 1; i++) {
      h = tickHealth(damage(h).health, T.invulnMs);
    }
    const { health, result } = damage(h);
    expect(result).toBe("dead");
    expect(health.hearts).toBe(0);
  });

  it("respawning refills hearts and gives a moment of safety", () => {
    const h = respawnHealth({ hearts: 0, maxHearts: 3, invulnMs: 0 });
    expect(h.hearts).toBe(3);
    expect(isInvulnerable(h)).toBe(true);
  });
});

describe("extra heart pickup", () => {
  it("heals a lost heart", () => {
    const hurt = { hearts: 2, maxHearts: 3, invulnMs: 0 };
    expect(heal(hurt).hearts).toBe(3);
  });

  it("at full health gives one golden bonus heart (but only one)", () => {
    const full = initialHealth();
    const bonus = heal(full);
    expect(bonus.hearts).toBe(full.maxHearts + 1);
    expect(hasBonusHeart(bonus)).toBe(true);
    expect(heal(bonus).hearts).toBe(full.maxHearts + 1);
  });

  it("the bonus heart is the first one lost", () => {
    const bonus = heal(initialHealth());
    const { health, result } = damage(bonus);
    expect(result).toBe("hurt");
    expect(health.hearts).toBe(health.maxHearts);
    expect(hasBonusHeart(health)).toBe(false);
  });
});
