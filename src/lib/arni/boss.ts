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

export type BossMode = "throne" | "intro" | "barrage" | "windup" | "charge" | "dizzy" | "hurt" | "defeated";
export type BossPhase = 1 | 2 | 3;
type Facing = 1 | -1;

export interface BossConfig {
  introMs: number;
  /** While seated on the throne (final level): time between taunts. */
  throneTauntMs: number;
  hurtMs: number;
  windupMs: number;
  firstThrowMs: number;
  /** Peels in a volley land spread around Arni by up to this many px. */
  peelSpread: number;
  hopSpeed: number;
  hopVelocity: number;
  chargeMaxMs: number;
  phases: {
    1: { volley: number; throwEveryMs: number; dizzyMs: number };
    2: { chargeSpeed: number; dizzyMs: number };
    3: { summon: number; volley: number; throwEveryMs: number; chargeSpeed: number; dizzyMs: number };
  };
  /** Hits to win: 1 in level 1, 2 in level 2, then the full 3-phase fight. */
  hits: number;
  /** Rex's size on screen and for collisions. */
  width: number;
  height: number;
}

/**
 * Rex for a level of the given difficulty (1–10). Rex gets tougher every
 * level — bigger volleys, faster throws and charges, more minions, shorter
 * dizzy windows — but the dizzy window never drops below ~2s, so Rex is always
 * beatable by a kid. Difficulty 3 is the "standard" fight (BOSS).
 */
export function bossConfig(difficulty: number): BossConfig {
  const d = Math.max(1, Math.min(10, Math.round(difficulty)));
  const step = Math.floor(d / 3);
  return {
    introMs: 1500,
    throneTauntMs: 4000,
    hurtMs: 1200,
    windupMs: 660 - 20 * d,
    firstThrowMs: 400,
    peelSpread: 80,
    hopSpeed: 260,
    hopVelocity: -700,
    chargeMaxMs: 3000,
    phases: {
      1: { volley: 2 + step, throwEveryMs: 760 - 20 * d, dizzyMs: 3500 - 100 * d },
      2: { chargeSpeed: 460 + 20 * d, dizzyMs: 3100 - 100 * d },
      3: { summon: 1 + step, volley: 3 + step, throwEveryMs: 510 - 20 * d, chargeSpeed: 540 + 20 * d, dizzyMs: 2550 - 50 * d },
    },
    hits: d === 1 ? 1 : d === 2 ? 2 : 3,
    width: 104,
    height: 140,
  };
}

/** The standard fight (difficulty 3). */
export const BOSS: BossConfig = bossConfig(3);

export interface BossState {
  cfg: BossConfig;
  phase: BossPhase;
  hitsLeft: number;
  mode: BossMode;
  timerMs: number;
  facing: Facing;
  volleyLeft: number;
  volleyIndex: number;
  summoned: boolean;
  /** Remaining time of the leap off the throne (moves toward Arni). */
  leapMs: number;
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

export type BossEvent = "throneTaunt" | "rise" | "taunt" | "throw" | "dizzy" | "recover" | "charge" | "slam" | "summon" | "hop";

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
const LEAP_MS = 500;

export function initialBoss(cfg: BossConfig = BOSS, opts: { throne?: boolean } = {}): BossState {
  return {
    cfg,
    phase: 1,
    hitsLeft: cfg.hits,
    mode: opts.throne ? "throne" : "intro",
    timerMs: opts.throne ? cfg.throneTauntMs : cfg.introMs,
    facing: -1,
    volleyLeft: 0,
    volleyIndex: 0,
    summoned: false,
    hopPending: false,
    leapMs: 0,
  };
}

/** Try to hit Rex. Only works while dizzy. */
export function bossHit(s: BossState): { state: BossState; result: "hit" | "immune" | "defeated" } {
  if (s.mode !== "dizzy") return { state: s, result: "immune" };
  const hitsLeft = s.hitsLeft - 1;
  if (hitsLeft <= 0) return { state: { ...s, hitsLeft: 0, mode: "defeated", timerMs: 0 }, result: "defeated" };
  return {
    state: { ...s, hitsLeft, phase: (s.phase + 1) as BossPhase, mode: "hurt", timerMs: s.cfg.hurtMs, hopPending: true },
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
    const p = s.phase === 3 ? s.cfg.phases[3] : s.cfg.phases[1];
    s.mode = "barrage";
    s.volleyLeft = p.volley;
    s.volleyIndex = 0;
    s.timerMs = s.cfg.firstThrowMs;
  };
  const startWindup = () => {
    s.mode = "windup";
    s.timerMs = s.cfg.windupMs;
    faceArni();
  };
  const startPhase = () => {
    if (s.phase === 2) return startWindup();
    if (s.phase === 3 && !s.summoned) {
      s.summoned = true;
      out.summon = s.cfg.phases[3].summon;
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

    case "throne":
      // Seated and smug while the guards do the work: no moving, no attacks.
      faceArni();
      if (s.timerMs <= EPS) {
        s.timerMs = s.cfg.throneTauntMs;
        out.events.push("throneTaunt");
      }
      break;

    case "intro":
      faceArni();
      if (s.hopPending) {
        // Leaping down off the throne toward Arni.
        s.hopPending = false;
        s.leapMs = LEAP_MS;
        out.jump = s.cfg.hopVelocity;
        out.events.push("rise");
      }
      if (s.leapMs > 0) {
        out.vx = s.facing * s.cfg.hopSpeed;
        s.leapMs = Math.max(0, s.leapMs - dtMs);
      }
      if (prev.timerMs === s.cfg.introMs) out.events.push("taunt");
      if (s.timerMs <= EPS) startPhase();
      break;

    case "barrage": {
      faceArni();
      const p = s.phase === 3 ? s.cfg.phases[3] : s.cfg.phases[1];
      if (s.timerMs > EPS) break;
      if (s.volleyLeft > 0) {
        const offset = ((s.volleyIndex % 3) - 1) * s.cfg.peelSpread;
        out.throws.push({ dx: sense.arniDx + offset, dy: sense.arniDy });
        out.events.push("throw");
        s.volleyLeft -= 1;
        s.volleyIndex += 1;
        s.timerMs = p.throwEveryMs;
      } else if (s.phase === 3) {
        startWindup();
      } else {
        getDizzy(s.cfg.phases[1].dizzyMs);
      }
      break;
    }

    case "windup":
      if (s.timerMs <= EPS) {
        s.mode = "charge";
        s.timerMs = s.cfg.chargeMaxMs;
        out.events.push("charge");
        out.vx = s.facing * chargeSpeed(s);
      }
      break;

    case "charge":
      if (sense.wallAhead) {
        out.events.push("slam");
        getDizzy(dizzyMs(s));
      } else if (s.timerMs <= EPS) {
        getDizzy(dizzyMs(s));
      } else {
        out.vx = s.facing * chargeSpeed(s);
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
        out.jump = s.cfg.hopVelocity;
        out.events.push("hop");
      }
      if (s.timerMs > s.cfg.hurtMs - 500) out.vx = away * s.cfg.hopSpeed;
      if (s.timerMs <= EPS) startPhase();
      break;
    }
  }
  return out;
}

function chargeSpeed(s: BossState): number {
  const phase = s.phase;
  return phase === 3 ? s.cfg.phases[3].chargeSpeed : s.cfg.phases[2].chargeSpeed;
}

function dizzyMs(s: BossState): number {
  const phase = s.phase;
  return s.cfg.phases[phase].dizzyMs;
}

/**
 * The final level's guards are all defeated: Rex leaps off the throne and
 * the normal fight begins. No effect unless Rex is still seated.
 */
export function throneCleared(s: BossState): BossState {
  if (s.mode !== "throne") return s;
  return { ...s, mode: "intro", timerMs: s.cfg.introMs, hopPending: true };
}
