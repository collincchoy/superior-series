/**
 * Rex's banana minions — one small state machine per ripeness.
 * Pure: the scene supplies senses (walls, ledges, where Arni is) and
 * applies the returned velocity, projectiles and goo.
 */
import { TILE_SIZE as T } from "./constants.js";

export type MinionKind = "bunchling" | "peelback" | "bruiser" | "spotter" | "mush" | "miniMush" | "crownie";
export type Facing = 1 | -1;
export type AiMode =
  | "walk"
  | "panic" // bunchling
  | "windup" // peelback
  | "charge"
  | "dizzy"
  | "angry" // bruiser
  | "rage"
  | "sleep" // spotter
  | "awake"
  | "aim"; // crownie: glowing, about to fire

export const AI = {
  bunchling: { speed: 90, decideMs: 700, panicChance: 0.35, panicMs: 450 },
  peelback: {
    patrolSpeed: 70,
    chargeSpeed: 430,
    sightTiles: 7,
    sightDy: 48,
    windupMs: 380,
    chargeMaxMs: 1300,
    dizzyMs: 1000,
  },
  bruiser: { speed: 50, angryPauseMs: 500, angrySpeed: 120, rageMs: 2500 },
  spotter: { wakeTiles: 8, wakeDyTiles: 6, firstThrowMs: 600, throwEveryMs: 1800, sleepAfterMs: 2500 },
  mush: { speed: 45, gooSpacing: 40 },
  miniMush: { speed: 85 },
  crownie: {
    speed: 70,
    turnEveryMs: 2200,
    sightTiles: 8,
    sightDyTiles: 6,
    firstShotMs: 900,
    /** Telegraph: the crown glows and holds still this long before firing. */
    aimMs: 500,
    shootEveryMs: 2400,
    shotSpeed: 300,
  },
} as const;

export interface AiState {
  kind: MinionKind;
  facing: Facing;
  mode: AiMode;
  /** Time left in the current mode (or until the next decision). */
  timerMs: number;
  /** Spotter: time until next throw. */
  throwMs: number;
  /** Mush: distance crawled since the last goo blob. */
  gooDist: number;
}

export interface AiSense {
  grounded: boolean;
  wallAhead: boolean;
  groundAhead: boolean;
  /** Arni's position relative to this minion (px). dy < 0 means Arni is above. */
  arniDx: number;
  arniDy: number;
}

export type AiEvent = "turn" | "panic" | "spotted" | "charge" | "dizzy" | "wake" | "sleep" | "throw" | "aim" | "fire";

export interface AiOutput {
  state: AiState;
  vx: number;
  /** Lob a peel at this offset (spotter). */
  throwAt: { dx: number; dy: number } | null;
  /** Shoot a straight fireball at this offset (crownie). */
  fireAt: { dx: number; dy: number } | null;
  dropGoo: boolean;
  events: AiEvent[];
}

const EPS = 1e-6;

export function initialAi(kind: MinionKind, facing: Facing = -1): AiState {
  const mode: AiMode = kind === "spotter" ? "sleep" : "walk";
  const timerMs = kind === "bunchling" ? AI.bunchling.decideMs : kind === "crownie" ? AI.crownie.turnEveryMs : 0;
  const throwMs = kind === "crownie" ? AI.crownie.firstShotMs : 0;
  return { kind, facing, mode, timerMs, throwMs, gooDist: 0 };
}

/** React to being hit but not defeated. */
export function aiOnHit(s: AiState): AiState {
  if (s.kind === "bruiser") return { ...s, mode: "angry", timerMs: AI.bruiser.angryPauseMs };
  return s;
}

export function splitOnDefeat(kind: MinionKind): MinionKind[] {
  return kind === "mush" ? ["miniMush", "miniMush"] : [];
}

/** Launch velocity so a projectile under gravity `g` lands at (dx, dy) after flightMs. */
export function lobVelocity(dx: number, dy: number, flightMs: number, g: number): { vx: number; vy: number } {
  const t = flightMs / 1000;
  return { vx: dx / t, vy: (dy - 0.5 * g * t * t) / t };
}

export function stepAi(prev: AiState, sense: AiSense, dtMs: number, rand: () => number = Math.random): AiOutput {
  const s: AiState = { ...prev, timerMs: prev.timerMs - dtMs };
  const out: AiOutput = { state: s, vx: 0, throwAt: null, fireAt: null, dropGoo: false, events: [] };
  const turn = () => {
    s.facing = (s.facing * -1) as Facing;
    out.events.push("turn");
  };
  /** Patrol helper: turn at walls (and optionally ledges), then walk. */
  const patrol = (speed: number, turnAtLedges: boolean) => {
    if (sense.grounded && (sense.wallAhead || (turnAtLedges && !sense.groundAhead))) turn();
    out.vx = s.facing * speed;
  };

  switch (s.kind) {
    case "bunchling": {
      const A = AI.bunchling;
      if (s.mode === "panic") {
        if (s.timerMs <= EPS) {
          s.mode = "walk";
          s.timerMs = A.decideMs;
        }
        if (s.mode === "panic") break;
      }
      if (s.timerMs <= EPS) {
        s.timerMs = A.decideMs;
        if (rand() < A.panicChance) {
          s.mode = "panic";
          s.timerMs = A.panicMs;
          if (rand() < 0.5) s.facing = (s.facing * -1) as Facing;
          out.events.push("panic");
          break;
        }
      }
      // Too jittery to notice ledges — happily runs right off them.
      if (sense.wallAhead) turn();
      out.vx = s.facing * A.speed;
      break;
    }

    case "peelback": {
      const A = AI.peelback;
      if (s.mode === "walk") {
        const ahead = Math.sign(sense.arniDx) === s.facing && Math.abs(sense.arniDx) <= A.sightTiles * T;
        if (ahead && Math.abs(sense.arniDy) <= A.sightDy) {
          s.mode = "windup";
          s.timerMs = A.windupMs;
          out.events.push("spotted");
          break;
        }
        patrol(A.patrolSpeed, true);
      } else if (s.mode === "windup") {
        if (s.timerMs <= EPS) {
          s.mode = "charge";
          s.timerMs = A.chargeMaxMs;
          out.events.push("charge");
          out.vx = s.facing * A.chargeSpeed;
        }
      } else if (s.mode === "charge") {
        if (s.timerMs <= EPS || sense.wallAhead || (sense.grounded && !sense.groundAhead)) {
          s.mode = "dizzy";
          s.timerMs = A.dizzyMs;
          out.events.push("dizzy");
        } else {
          out.vx = s.facing * A.chargeSpeed;
        }
      } else if (s.mode === "dizzy" && s.timerMs <= EPS) {
        s.mode = "walk";
        patrol(A.patrolSpeed, true);
      }
      break;
    }

    case "bruiser": {
      const A = AI.bruiser;
      if (s.mode === "angry") {
        if (s.timerMs > EPS) break;
        s.mode = "rage";
        s.timerMs = A.rageMs;
      }
      if (s.mode === "rage" && s.timerMs <= EPS) s.mode = "walk";
      patrol(s.mode === "rage" ? A.angrySpeed : A.speed, true);
      break;
    }

    case "spotter": {
      const A = AI.spotter;
      const near = Math.abs(sense.arniDx) <= A.wakeTiles * T && Math.abs(sense.arniDy) <= A.wakeDyTiles * T;
      if (s.mode === "sleep") {
        if (near) {
          s.mode = "awake";
          s.throwMs = A.firstThrowMs;
          s.timerMs = A.sleepAfterMs;
          if (sense.arniDx !== 0) s.facing = Math.sign(sense.arniDx) as Facing;
          out.events.push("wake");
        }
        break;
      }
      if (near) {
        s.timerMs = A.sleepAfterMs;
        if (sense.arniDx !== 0) s.facing = Math.sign(sense.arniDx) as Facing;
        s.throwMs -= dtMs;
        if (s.throwMs <= EPS) {
          s.throwMs = A.throwEveryMs;
          out.throwAt = { dx: sense.arniDx, dy: sense.arniDy };
          out.events.push("throw");
        }
      } else if (s.timerMs <= EPS) {
        s.mode = "sleep";
        out.events.push("sleep");
      }
      break;
    }

    case "mush": {
      const A = AI.mush;
      patrol(A.speed, true);
      if (sense.grounded) {
        s.gooDist += (Math.abs(out.vx) * dtMs) / 1000;
        if (s.gooDist >= A.gooSpacing - EPS) {
          s.gooDist -= A.gooSpacing;
          out.dropGoo = true;
        }
      }
      break;
    }

    case "miniMush":
      patrol(AI.miniMush.speed, true);
      break;

    case "crownie": {
      // Flies: hovers back and forth, and when Arni is near, glows then fires.
      const A = AI.crownie;
      if (s.mode === "aim") {
        if (s.timerMs <= EPS) {
          out.fireAt = { dx: sense.arniDx, dy: sense.arniDy };
          out.events.push("fire");
          s.mode = "walk";
          s.timerMs = A.turnEveryMs;
          s.throwMs = A.shootEveryMs;
        }
        break;
      }
      if (sense.wallAhead || s.timerMs <= EPS) {
        turn();
        s.timerMs = A.turnEveryMs;
      }
      out.vx = s.facing * A.speed;
      const inSight = Math.abs(sense.arniDx) <= A.sightTiles * T && Math.abs(sense.arniDy) <= A.sightDyTiles * T;
      if (inSight) {
        s.throwMs -= dtMs;
        if (s.throwMs <= EPS) {
          s.mode = "aim";
          s.timerMs = A.aimMs;
          if (sense.arniDx !== 0) s.facing = Math.sign(sense.arniDx) as Facing;
          out.vx = 0;
          out.events.push("aim");
        }
      }
      break;
    }
  }
  return out;
}
