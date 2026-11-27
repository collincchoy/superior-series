import { describe, it, expect } from "vitest";
import {
  POWER,
  grantPower,
  hasPower,
  initialPowers,
  powerTimeLeft,
  tickPowers,
  tryFire,
} from "../../lib/arni/powerups.js";

describe("timed power-ups", () => {
  it("start with nothing", () => {
    const p = initialPowers();
    for (const k of ["fire", "pound", "sword"] as const) expect(hasPower(p, k)).toBe(false);
  });

  it("granting one lasts for its duration, then wears off", () => {
    let p = grantPower(initialPowers(), "sword");
    expect(hasPower(p, "sword")).toBe(true);
    expect(powerTimeLeft(p, "sword")).toBe(POWER.durationMs);
    p = tickPowers(p, POWER.durationMs - 1);
    expect(hasPower(p, "sword")).toBe(true);
    p = tickPowers(p, 2);
    expect(hasPower(p, "sword")).toBe(false);
  });

  it("several can be active at once, each with its own timer", () => {
    let p = grantPower(initialPowers(), "fire");
    p = tickPowers(p, 5000);
    p = grantPower(p, "pound");
    expect(powerTimeLeft(p, "fire")).toBe(POWER.durationMs - 5000);
    expect(powerTimeLeft(p, "pound")).toBe(POWER.durationMs);
  });

  it("picking up the same one again refreshes it", () => {
    let p = tickPowers(grantPower(initialPowers(), "fire"), 15000);
    p = grantPower(p, "fire");
    expect(powerTimeLeft(p, "fire")).toBe(POWER.durationMs);
  });

  it("hearts aren't timed powers", () => {
    expect(grantPower(initialPowers(), "heart")).toEqual(initialPowers());
  });
});

describe("fire roar", () => {
  it("can't fire without the power", () => {
    expect(tryFire(initialPowers()).fired).toBe(false);
  });

  it("fires, then has a short cooldown", () => {
    const p = grantPower(initialPowers(), "fire");
    const first = tryFire(p);
    expect(first.fired).toBe(true);
    expect(tryFire(first.powers).fired).toBe(false);
    const later = tickPowers(first.powers, POWER.fireCooldownMs);
    expect(tryFire(later).fired).toBe(true);
  });
});
