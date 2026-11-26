/**
 * Rex the Banana — 3-phase boss fight, as a pure state machine.
 *
 *  Phase 1  Peel Barrage — lobs a volley of peels, then gets dizzy.
 *  Phase 2  Banana Charge — winds up, charges, slams the wall, gets dizzy.
 *  Phase 3  Minion Call — summons minions, then a faster barrage + a charge.
 *
 * Rex can only be hurt while dizzy; 3 hits wins. The scene supplies senses
 * (where Arni is, walls) and applies the outputs (movement, peels, minions).
 */

export type BossMode = "intro" | "barrage" | "windup" | "charge" | "dizzy" | "hurt" | "defeated";
export type BossPhase = 1 | 2 | 3;
type Facing = 1 | -1;

export const BOSS = {
  introMs: 1500,
  hurtMs: 1200,
  windupMs: 600,
  firstThrowMs: 400,
  /** Peels in a volley land spread around Arni by up to this many px. */
  peelSpread: 80,
  hopSpeed: 260,
  hopVelocity: -700,
  chargeMaxMs: 3000,
  phases: {
    1: { volley: 3, throwEveryMs: 700, dizzyMs: 3200 },
    2: { chargeSpeed: 520, dizzyMs: 2800 },
    3: { summon: 2, volley: 4, throwEveryMs: 450, chargeSpeed: 600, dizzyMs: 2400 },
  },
  hits: 3,
  /** Rex's size on screen and for collisions. */
  width: 104,
  height: 140,
} as const;

export interface BossState {
  phase: BossPhase;
  hitsLeft: number;
  mode: BossMode;
  timerMs: number;
  facing: Facing;
  volleyLeft: number;
  volleyIndex: number;
  summoned: boolean;
  /** Set by a hit: hop back on the next step. */
  hopPending: boolean;
}

export interface BossSense {
  arniDx: number;
  arniDy: number;
  /** A wall right in front (ends a charge). */
  wallAhead: boolean;
  grounded: boolean;
}

export type BossEvent = "taunt" | "throw" | "dizzy" | "recover" | "charge" | "slam" | "summon" | "hop";

export interface BossOutput {
  state: BossState;
  vx: number;
  /** Upward launch velocity this frame (negative), or 0. */
  jump: number;
  throws: { dx: number; dy: number }[];
  summon: number;
  events: BossEvent[];
}

const EPS = 1e-6;

export function initialBoss(): BossState {
  return {
    phase: 1,
    hitsLeft: BOSS.hits,
    mode: "intro",
    timerMs: BOSS.introMs,
    facing: -1,
    volleyLeft: 0,
    volleyIndex: 0,
    summoned: false,
    hopPending: false,
  };
}

/** Try to hit Rex. Only works while dizzy. */
export function bossHit(s: BossState): { state: BossState; result: "hit" | "immune" | "defeated" } {
  if (s.mode !== "dizzy") return { state: s, result: "immune" };
  const hitsLeft = s.hitsLeft - 1;
  if (hitsLeft <= 0) return { state: { ...s, hitsLeft: 0, mode: "defeated", timerMs: 0 }, result: "defeated" };
  return {
    state: { ...s, hitsLeft, phase: (s.phase + 1) as BossPhase, mode: "hurt", timerMs: BOSS.hurtMs, hopPending: true },
    result: "hit",
  };
}

export function stepBoss(prev: BossState, sense: BossSense, dtMs: number): BossOutput {
  const s: BossState = { ...prev, timerMs: prev.timerMs - dtMs };
  const out: BossOutput = { state: s, vx: 0, jump: 0, throws: [], summon: 0, events: [] };
  const faceArni = () => {
    if (sense.arniDx !== 0) s.facing = Math.sign(sense.arniDx) as Facing;
  };

  const startBarrage = () => {
    const p = s.phase === 3 ? BOSS.phases[3] : BOSS.phases[1];
    s.mode = "barrage";
    s.volleyLeft = p.volley;
    s.volleyIndex = 0;
    s.timerMs = BOSS.firstThrowMs;
  };
  const startWindup = () => {
    s.mode = "windup";
    s.timerMs = BOSS.windupMs;
    faceArni();
  };
  const startPhase = () => {
    if (s.phase === 2) return startWindup();
    if (s.phase === 3 && !s.summoned) {
      s.summoned = true;
      out.summon = BOSS.phases[3].summon;
      out.events.push("summon");
    }
    startBarrage();
  };
  const getDizzy = (ms: number) => {
    s.mode = "dizzy";
    s.timerMs = ms;
    out.vx = 0;
    out.events.push("dizzy");
  };

  switch (s.mode) {
    case "defeated":
      break;

    case "intro":
      if (prev.timerMs === BOSS.introMs) out.events.push("taunt");
      faceArni();
      if (s.timerMs <= EPS) startPhase();
      break;

    case "barrage": {
      faceArni();
      const p = s.phase === 3 ? BOSS.phases[3] : BOSS.phases[1];
      if (s.timerMs > EPS) break;
      if (s.volleyLeft > 0) {
        const offset = ((s.volleyIndex % 3) - 1) * BOSS.peelSpread;
        out.throws.push({ dx: sense.arniDx + offset, dy: sense.arniDy });
        out.events.push("throw");
        s.volleyLeft -= 1;
        s.volleyIndex += 1;
        s.timerMs = p.throwEveryMs;
      } else if (s.phase === 3) {
        startWindup();
      } else {
        getDizzy(BOSS.phases[1].dizzyMs);
      }
      break;
    }

    case "windup":
      if (s.timerMs <= EPS) {
        s.mode = "charge";
        s.timerMs = BOSS.chargeMaxMs;
        out.events.push("charge");
        out.vx = s.facing * chargeSpeed(s.phase);
      }
      break;

    case "charge":
      if (sense.wallAhead) {
        out.events.push("slam");
        getDizzy(dizzyMs(s.phase));
      } else if (s.timerMs <= EPS) {
        getDizzy(dizzyMs(s.phase));
      } else {
        out.vx = s.facing * chargeSpeed(s.phase);
      }
      break;

    case "dizzy":
      if (s.timerMs <= EPS) {
        out.events.push("recover");
        if (s.phase === 2) startWindup();
        else startBarrage();
      }
      break;

    case "hurt": {
      const away = (sense.arniDx === 0 ? -s.facing : -Math.sign(sense.arniDx)) as Facing;
      if (s.hopPending) {
        s.hopPending = false;
        out.jump = BOSS.hopVelocity;
        out.events.push("hop");
      }
      if (s.timerMs > BOSS.hurtMs - 500) out.vx = away * BOSS.hopSpeed;
      if (s.timerMs <= EPS) startPhase();
      break;
    }
  }
  return out;
}

function chargeSpeed(phase: BossPhase): number {
  return phase === 3 ? BOSS.phases[3].chargeSpeed : BOSS.phases[2].chargeSpeed;
}

function dizzyMs(phase: BossPhase): number {
  return BOSS.phases[phase].dizzyMs;
}
