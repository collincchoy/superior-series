import { describe, it, expect } from "vitest";
import {
  AI,
  aiOnHit,
  initialAi,
  lobVelocity,
  splitOnDefeat,
  stepAi,
  type AiOutput,
  type AiSense,
  type AiState,
} from "../../lib/arni/enemyAi.js";
import { TILE_SIZE as T } from "../../lib/arni/constants.js";

const DT = 1000 / 60;
const FAR: AiSense = { grounded: true, wallAhead: false, groundAhead: true, arniDx: 5000, arniDy: 0 };
const never = () => 0.99; // rand that never triggers random behavior

function run(state: AiState, sense: Partial<AiSense>, frames: number, rand = never) {
  const outs: AiOutput[] = [];
  let s = state;
  for (let i = 0; i < frames; i++) {
    const o = stepAi(s, { ...FAR, ...sense }, DT, rand);
    outs.push(o);
    s = o.state;
  }
  return { state: s, outs, last: outs[outs.length - 1], events: outs.flatMap((o) => o.events) };
}

describe("Bunchling (green, jittery)", () => {
  it("walks in the direction it faces", () => {
    const { last } = run(initialAi("bunchling", -1), {}, 1);
    expect(last.vx).toBe(-AI.bunchling.speed);
  });

  it("turns around at a wall", () => {
    const { last, events } = run(initialAi("bunchling", -1), { wallAhead: true }, 1);
    expect(events).toContain("turn");
    expect(last.vx).toBeGreaterThan(0);
  });

  it("does NOT turn at a ledge — it panics right off it", () => {
    const { last, events } = run(initialAi("bunchling", -1), { groundAhead: false }, 5);
    expect(events).not.toContain("turn");
    expect(last.vx).toBeLessThan(0);
  });

  it("sometimes stops to panic, then carries on", () => {
    const panicky = () => 0;
    const frames = Math.ceil(AI.bunchling.decideMs / DT) + 1;
    const r = run(initialAi("bunchling", -1), {}, frames, panicky);
    expect(r.events).toContain("panic");
    expect(r.state.mode).toBe("panic");
    expect(r.last.vx).toBe(0);
    const after = run(r.state, {}, Math.ceil(AI.bunchling.panicMs / DT) + 1, never);
    expect(after.state.mode).toBe("walk");
    expect(Math.abs(after.last.vx)).toBe(AI.bunchling.speed);
  });
});

describe("Peelback (ripe, charger)", () => {
  it("patrols and turns at ledges instead of falling", () => {
    const { last, events } = run(initialAi("peelback", -1), { groundAhead: false }, 1);
    expect(events).toContain("turn");
    expect(last.vx).toBe(AI.peelback.patrolSpeed);
  });

  it("spots Arni ahead on the same level and winds up", () => {
    const { state, last, events } = run(initialAi("peelback", -1), { arniDx: -4 * T, arniDy: 0 }, 1);
    expect(events).toContain("spotted");
    expect(state.mode).toBe("windup");
    expect(last.vx).toBe(0);
  });

  it("ignores Arni behind it or far above", () => {
    expect(run(initialAi("peelback", -1), { arniDx: 4 * T }, 1).state.mode).toBe("walk");
    expect(run(initialAi("peelback", -1), { arniDx: -4 * T, arniDy: -4 * T }, 1).state.mode).toBe("walk");
  });

  it("charges after the windup, fast", () => {
    const wind = run(initialAi("peelback", -1), { arniDx: -4 * T }, 1).state;
    const r = run(wind, { arniDx: -4 * T }, Math.ceil(AI.peelback.windupMs / DT) + 1);
    expect(r.events).toContain("charge");
    expect(r.last.vx).toBe(-AI.peelback.chargeSpeed);
  });

  it("stops at a ledge and gets dizzy, then patrols again", () => {
    const wind = run(initialAi("peelback", -1), { arniDx: -4 * T }, 1).state;
    const charging = run(wind, {}, Math.ceil(AI.peelback.windupMs / DT) + 1).state;
    const r = run(charging, { groundAhead: false }, 1);
    expect(r.events).toContain("dizzy");
    expect(r.last.vx).toBe(0);
    const back = run(r.state, {}, Math.ceil(AI.peelback.dizzyMs / DT) + 1);
    expect(back.state.mode).toBe("walk");
  });

  it("gives up a long charge and gets dizzy", () => {
    const wind = run(initialAi("peelback", -1), { arniDx: -4 * T }, 1).state;
    const r = run(wind, {}, Math.ceil((AI.peelback.windupMs + AI.peelback.chargeMaxMs) / DT) + 2);
    expect(r.events).toContain("dizzy");
  });
});

describe("Bruiser (bruised, tough)", () => {
  it("patrols slowly and turns at ledges", () => {
    const { last, events } = run(initialAi("bruiser", 1), { groundAhead: false }, 1);
    expect(events).toContain("turn");
    expect(last.vx).toBe(-AI.bruiser.speed);
  });

  it("gets angry when hit: pauses, then stomps around faster", () => {
    const angry = aiOnHit(initialAi("bruiser", 1));
    expect(angry.mode).toBe("angry");
    const pause = run(angry, {}, 1);
    expect(pause.last.vx).toBe(0);
    const r = run(angry, {}, Math.ceil(AI.bruiser.angryPauseMs / DT) + 2);
    expect(Math.abs(r.last.vx)).toBe(AI.bruiser.angrySpeed);
  });
});

describe("Spotter (brown, sleepy peel-lobber)", () => {
  it("snoozes while Arni is far away", () => {
    const r = run(initialAi("spotter", -1), {}, 120);
    expect(r.state.mode).toBe("sleep");
    expect(r.outs.every((o) => o.vx === 0 && o.throwAt === null)).toBe(true);
  });

  it("wakes when Arni comes close and faces him", () => {
    const r = run(initialAi("spotter", -1), { arniDx: 5 * T, arniDy: 2 * T }, 1);
    expect(r.events).toContain("wake");
    expect(r.state.facing).toBe(1);
  });

  it("lobs peels at Arni on a rhythm", () => {
    const sense = { arniDx: -5 * T, arniDy: 2 * T };
    const r = run(initialAi("spotter", -1), sense, Math.ceil((AI.spotter.firstThrowMs + AI.spotter.throwEveryMs) / DT) + 2);
    const throws = r.outs.filter((o) => o.throwAt);
    expect(throws).toHaveLength(2);
    expect(throws[0].throwAt).toEqual({ dx: -5 * T, dy: 2 * T });
    expect(r.events.filter((e) => e === "throw")).toHaveLength(2);
  });

  it("dozes off again after Arni leaves", () => {
    const awake = run(initialAi("spotter", -1), { arniDx: -5 * T }, 1).state;
    const r = run(awake, {}, Math.ceil(AI.spotter.sleepAfterMs / DT) + 2);
    expect(r.state.mode).toBe("sleep");
    expect(r.events).toContain("sleep");
  });
});

describe("Mush (rotten, gooey)", () => {
  it("crawls and turns at ledges", () => {
    const { last, events } = run(initialAi("mush", -1), { groundAhead: false }, 1);
    expect(events).toContain("turn");
    expect(last.vx).toBe(AI.mush.speed);
  });

  it("leaves goo behind as it travels", () => {
    const frames = Math.ceil(((AI.mush.gooSpacing * 3) / AI.mush.speed) * 60) + 2;
    const r = run(initialAi("mush", -1), {}, frames);
    expect(r.outs.filter((o) => o.dropGoo)).toHaveLength(3);
  });

  it("splits into two mini mushes when defeated; nobody else splits", () => {
    expect(splitOnDefeat("mush")).toEqual(["miniMush", "miniMush"]);
    for (const k of ["bunchling", "peelback", "bruiser", "spotter", "miniMush"] as const) {
      expect(splitOnDefeat(k)).toEqual([]);
    }
  });

  it("mini mushes scurry faster and leave no goo", () => {
    const r = run(initialAi("miniMush", 1), {}, 120);
    expect(r.last.vx).toBe(AI.miniMush.speed);
    expect(AI.miniMush.speed).toBeGreaterThan(AI.mush.speed);
    expect(r.outs.some((o) => o.dropGoo)).toBe(false);
  });
});

describe("lobVelocity", () => {
  it("launches a projectile that lands on the target after the flight time", () => {
    const g = 1600;
    const { vx, vy } = lobVelocity(-300, 120, 900, g);
    // integrate
    let x = 0;
    let y = 0;
    let v = vy;
    const steps = 900;
    for (let i = 0; i < steps; i++) {
      x += vx / 1000;
      v += g / 1000;
      y += v / 1000;
    }
    expect(x).toBeCloseTo(-300, 0);
    expect(Math.abs(y - 120)).toBeLessThan(2);
    expect(vy).toBeLessThan(0); // goes up first
  });
});
