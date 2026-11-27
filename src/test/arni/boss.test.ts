import { describe, it, expect } from "vitest";
import {
  BOSS,
  bossHit,
  initialBoss,
  stepBoss,
  throneCleared,
  type BossOutput,
  type BossSense,
  type BossState,
} from "../../lib/arni/boss.js";
import { TILE_SIZE as T } from "../../lib/arni/constants.js";

const DT = 1000 / 60;
const SENSE: BossSense = { arniDx: -6 * T, arniDy: 0, wallAhead: false, grounded: true };

function run(state: BossState, frames: number, sense: Partial<BossSense> = {}) {
  const outs: BossOutput[] = [];
  let s = state;
  for (let i = 0; i < frames; i++) {
    const o = stepBoss(s, { ...SENSE, ...sense }, DT);
    outs.push(o);
    s = o.state;
  }
  return { state: s, outs, last: outs[outs.length - 1], events: outs.flatMap((o) => o.events) };
}

const frames = (ms: number) => Math.ceil(ms / DT) + 1;

/** Run until the boss enters `mode` (or give up). */
function until(state: BossState, mode: BossState["mode"], sense: Partial<BossSense> = {}, max = 2000) {
  let s = state;
  const outs: BossOutput[] = [];
  for (let i = 0; i < max && s.mode !== mode; i++) {
    const o = stepBoss(s, { ...SENSE, ...sense }, DT);
    outs.push(o);
    s = o.state;
  }
  return { state: s, outs, events: outs.flatMap((o) => o.events) };
}

describe("Rex — intro", () => {
  it("starts with a taunt, then begins phase 1", () => {
    const s = initialBoss();
    expect(s.mode).toBe("intro");
    expect(s.phase).toBe(1);
    expect(s.hitsLeft).toBe(3);
    const r = run(s, frames(BOSS.introMs));
    expect(r.state.mode).toBe("barrage");
  });

  it("doesn't move or attack during the intro", () => {
    const r = run(initialBoss(), 30);
    expect(r.outs.every((o) => o.vx === 0 && o.throws.length === 0)).toBe(true);
  });
});

describe("Rex — phase 1: peel barrage", () => {
  const start = () => run(initialBoss(), frames(BOSS.introMs)).state;

  it("throws a volley of peels aimed around Arni, then gets dizzy", () => {
    const r = until(start(), "dizzy");
    const throws = r.outs.flatMap((o) => o.throws);
    expect(throws).toHaveLength(BOSS.phases[1].volley);
    // aimed roughly at Arni, spread a little
    for (const t of throws) expect(Math.abs(t.dx - SENSE.arniDx)).toBeLessThanOrEqual(BOSS.peelSpread);
    expect(r.events).toContain("dizzy");
  });

  it("faces Arni while throwing", () => {
    const r = run(start(), 2, { arniDx: 5 * T });
    expect(r.state.facing).toBe(1);
  });

  it("recovers from dizziness and attacks again if not hit", () => {
    const dizzy = until(start(), "dizzy").state;
    const r = run(dizzy, frames(BOSS.phases[1].dizzyMs));
    expect(r.state.mode).toBe("barrage");
    expect(r.state.phase).toBe(1);
  });
});

describe("Rex — getting hit", () => {
  const dizzy = () => until(run(initialBoss(), frames(BOSS.introMs)).state, "dizzy").state;

  it("is immune unless dizzy", () => {
    const attacking = run(initialBoss(), frames(BOSS.introMs)).state;
    const r = bossHit(attacking);
    expect(r.result).toBe("immune");
    expect(r.state).toEqual(attacking);
  });

  it("a hit while dizzy costs a heart-of-Rex and advances the phase after a hop back", () => {
    const r = bossHit(dizzy());
    expect(r.result).toBe("hit");
    expect(r.state.hitsLeft).toBe(2);
    expect(r.state.mode).toBe("hurt");
    expect(bossHit(r.state).result).toBe("immune"); // no double hits
    const next = run(r.state, frames(BOSS.hurtMs));
    expect(next.state.phase).toBe(2);
    expect(next.state.mode).toBe("windup");
  });

  it("hops away from Arni when hurt", () => {
    const hurt = bossHit(dizzy()).state;
    const o = stepBoss(hurt, { ...SENSE, arniDx: -3 * T }, DT);
    expect(o.jump).toBeLessThan(0);
    expect(o.vx).toBeGreaterThan(0); // Arni is to the left, so hop right
  });
});

describe("Rex — phase 2: banana charge", () => {
  const phase2 = () => {
    let s = until(run(initialBoss(), frames(BOSS.introMs)).state, "dizzy").state;
    s = bossHit(s).state;
    return run(s, frames(BOSS.hurtMs)).state; // windup
  };

  it("winds up facing Arni, then charges fast", () => {
    const r = run(phase2(), frames(BOSS.windupMs), { arniDx: -5 * T });
    expect(r.events).toContain("charge");
    expect(r.state.mode).toBe("charge");
    expect(r.last.vx).toBe(-BOSS.phases[2].chargeSpeed);
  });

  it("slams into the wall and gets dizzy", () => {
    const charging = until(phase2(), "charge").state;
    const r = run(charging, 1, { wallAhead: true });
    expect(r.events).toContain("slam");
    expect(r.state.mode).toBe("dizzy");
    expect(r.last.vx).toBe(0);
  });
});

describe("Rex — phase 3: minion call", () => {
  const phase3 = () => {
    let s = until(run(initialBoss(), frames(BOSS.introMs)).state, "dizzy").state;
    s = bossHit(s).state;
    s = until(s, "charge").state;
    s = run(s, 1, { wallAhead: true }).state; // dizzy
    s = bossHit(s).state;
    return run(s, frames(BOSS.hurtMs));
  };

  it("summons minions when phase 3 starts", () => {
    const r = phase3();
    expect(r.state.phase).toBe(3);
    const summoned = r.outs.reduce((n, o) => n + o.summon, 0);
    expect(summoned).toBe(BOSS.phases[3].summon);
  });

  it("mixes a faster barrage with a charge before getting dizzy", () => {
    const r = until(phase3().state, "dizzy", { wallAhead: false }, 600);
    // it barrages first…
    expect(r.outs.flatMap((o) => o.throws).length).toBe(BOSS.phases[3].volley);
    expect(BOSS.phases[3].throwEveryMs).toBeLessThan(BOSS.phases[1].throwEveryMs);
  });

  it("the third hit defeats Rex", () => {
    let s = phase3().state;
    s = until(s, "charge").state;
    s = run(s, 1, { wallAhead: true }).state;
    expect(s.mode).toBe("dizzy");
    const r = bossHit(s);
    expect(r.result).toBe("defeated");
    expect(r.state.mode).toBe("defeated");
    expect(r.state.hitsLeft).toBe(0);
    const after = run(r.state, 60);
    expect(after.outs.every((o) => o.vx === 0 && o.throws.length === 0)).toBe(true);
  });
});

describe("Rex on the throne (final level)", () => {
  const throned = () => initialBoss(BOSS, { throne: true });

  it("starts seated on the throne", () => {
    expect(throned().mode).toBe("throne");
    expect(initialBoss().mode).toBe("intro"); // normal levels are unchanged
  });

  it("stays seated — no moving, no attacks — however long the guards hold out", () => {
    const r = run(throned(), 60 * 20);
    expect(r.state.mode).toBe("throne");
    expect(r.outs.every((o) => o.vx === 0 && o.jump === 0 && o.throws.length === 0 && o.summon === 0)).toBe(true);
  });

  it("taunts from the throne now and then", () => {
    const r = run(throned(), frames(BOSS.throneTauntMs * 2));
    expect(r.events.filter((e) => e === "throneTaunt").length).toBeGreaterThanOrEqual(2);
  });

  it("can't be hurt while seated", () => {
    expect(bossHit(throned()).result).toBe("immune");
  });

  it("when the guards are cleared, Rex leaps off the throne and the fight begins", () => {
    const risen = throneCleared(throned());
    expect(risen.mode).toBe("intro");
    const first = stepBoss(risen, SENSE, DT);
    expect(first.events).toContain("rise");
    expect(first.jump).toBeLessThan(0);
    expect(first.vx).toBeLessThan(0); // leaps toward Arni (who is to the left)
    const r = run(first.state, frames(BOSS.introMs));
    expect(r.state.mode).toBe("barrage");
  });

  it("clearing the throne only matters while Rex is on it", () => {
    const fighting = run(initialBoss(), frames(BOSS.introMs)).state;
    expect(throneCleared(fighting)).toBe(fighting);
  });
});
