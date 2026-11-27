/**
 * Arni's movement state machine — pure, framework-free, unit-tested.
 *
 * Each frame the scene passes the physics body's post-collision velocity
 * and contact info (`PlayerEnv`); stepPlayer returns the new velocity and
 * pose. Gravity lives here (the body has Arcade gravity disabled) so jump
 * arcs are fully controlled and testable.
 */
import type { PlayerInput } from "./input.js";
import { TUNING as T } from "./tuning.js";

export type Pose = "stand" | "crouch" | "slide";
export type Facing = 1 | -1;

export interface PlayerState {
  pose: Pose;
  facing: Facing;
  vx: number;
  /** Positive is down (screen coordinates). */
  vy: number;
  grounded: boolean;
  coyoteMs: number;
  jumpBufferMs: number;
  chargeMs: number;
  slideMs: number;
  /** Jump button held last frame (for press detection). */
  jumpHeld: boolean;
  /** In the rising part of a jump that can still be cut short. */
  rising: boolean;
  /** Remaining time the tail-whip hitbox is active. */
  attackMs: number;
  attackCooldownMs: number;
  attackHeld: boolean;
  /** Remaining knockback stun (no control). */
  stunMs: number;
  /** Slamming down in a ground pound. */
  pounding: boolean;
  downHeld: boolean;
}

export interface PlayerEnv {
  grounded: boolean;
  /** Is there head room to stand up from crouch/slide? */
  canStand: boolean;
  /** Standing in goo: sluggish to start, slow to stop. */
  slippery?: boolean;
  /** Has the ground-pound power-up. */
  canPound?: boolean;
  vx: number;
  vy: number;
}

export type PlayerEvent =
  | "jump"
  | "chargedJump"
  | "chargeReady"
  | "land"
  | "crouch"
  | "stand"
  | "slideStart"
  | "slideEnd"
  | "whip"
  | "poundStart"
  | "poundLand";

export interface StepResult {
  state: PlayerState;
  events: PlayerEvent[];
}

const BODIES: Record<Pose, { width: number; height: number }> = {
  stand: { width: 44, height: 78 },
  crouch: { width: 60, height: 44 },
  slide: { width: 60, height: 40 },
};

/** Collision box for a pose. Feet stay at the bottom of the sprite. */
export function bodyFor(pose: Pose): { width: number; height: number } {
  return BODIES[pose];
}

export function initialPlayer(): PlayerState {
  return {
    pose: "stand",
    facing: 1,
    vx: 0,
    vy: 0,
    grounded: false,
    coyoteMs: 0,
    jumpBufferMs: 0,
    chargeMs: 0,
    slideMs: 0,
    jumpHeld: false,
    rising: false,
    attackMs: 0,
    attackCooldownMs: 0,
    attackHeld: false,
    stunMs: 0,
    pounding: false,
    downHeld: false,
  };
}

export function isWhipping(s: PlayerState): boolean {
  return s.attackMs > 0;
}

/** Knock Arni away from a hit. `fromDir` is the side the hit came from (+1 right, -1 left, 0 below). */
export function applyHurt(s: PlayerState, fromDir: -1 | 0 | 1): PlayerState {
  return {
    ...s,
    vx: -fromDir * T.hurtKnockbackX,
    vy: -T.hurtKnockbackY,
    stunMs: T.hurtStunMs,
    grounded: false,
    rising: false,
    attackMs: 0,
    slideMs: 0,
    chargeMs: 0,
    pounding: false,
    pose: s.pose === "slide" ? "crouch" : s.pose,
  };
}

/** Launch off a bounce mushroom. Holding jump goes even higher. */
export function applySpring(s: PlayerState, jumpHeld: boolean): PlayerState {
  return {
    ...s,
    vy: -(jumpHeld ? T.springVelocityHigh : T.springVelocity),
    grounded: false,
    rising: false, // springs can't be cut short — the fun is the big launch
    coyoteMs: 0,
    jumpBufferMs: 0,
    chargeMs: 0,
  };
}

/** Bounce off a stomped enemy. Holding jump bounces higher (and can still be cut short). */
export function applyBounce(s: PlayerState, jumpHeld: boolean): PlayerState {
  return {
    ...s,
    vy: -(jumpHeld ? T.stompBounceHigh : T.stompBounce),
    grounded: false,
    rising: jumpHeld,
    coyoteMs: 0,
    jumpBufferMs: 0,
  };
}

function approach(value: number, target: number, delta: number): number {
  return value < target
    ? Math.min(value + delta, target)
    : Math.max(value - delta, target);
}

export function stepPlayer(
  prev: PlayerState,
  input: PlayerInput,
  env: PlayerEnv,
  dtMs: number,
): StepResult {
  const dt = dtMs / 1000;
  const events: PlayerEvent[] = [];
  const s: PlayerState = { ...prev, vx: env.vx, vy: env.vy, grounded: env.grounded };

  // Contact
  if (s.grounded && !prev.grounded) {
    events.push("land");
    s.rising = false;
  }
  s.coyoteMs = s.grounded ? T.coyoteMs : Math.max(0, s.coyoteMs - dtMs);

  // Knockback stun: no steering, jumping or attacking
  const stunned = prev.stunMs > 0;
  s.stunMs = Math.max(0, s.stunMs - dtMs);

  // Jump press + buffer
  const jumpNow = input.jump || input.up;
  const jumpPressed = jumpNow && !prev.jumpHeld && !stunned;
  s.jumpBufferMs = jumpPressed ? T.jumpBufferMs : Math.max(0, s.jumpBufferMs - dtMs);
  s.jumpHeld = jumpNow;

  // Tail whip
  s.attackMs = Math.max(0, s.attackMs - dtMs);
  s.attackCooldownMs = Math.max(0, s.attackCooldownMs - dtMs);
  const attackPressed = input.attack && !prev.attackHeld;
  s.attackHeld = input.attack;
  if (attackPressed && !stunned && s.attackCooldownMs === 0 && s.pose !== "slide") {
    s.attackMs = T.whipMs;
    s.attackCooldownMs = T.whipCooldownMs;
    events.push("whip");
  }

  // Ground pound (power-up): Down in mid-air slams straight down until landing.
  const downPressed = input.down && !prev.downHeld;
  s.downHeld = input.down;
  if (prev.pounding && s.grounded) {
    s.pounding = false;
    events.push("poundLand");
  } else if (!s.pounding && !s.grounded && downPressed && env.canPound && !stunned) {
    s.pounding = true;
    s.rising = false;
    s.chargeMs = 0;
    events.push("poundStart");
  }
  if (s.pounding) {
    s.vx = 0;
    s.vy = T.poundSpeed;
    s.jumpBufferMs = 0;
    return { state: s, events };
  }

  const dir = stunned ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir !== 0 && s.pose !== "slide") s.facing = dir as Facing;

  // Pose transitions
  if (s.pose === "slide") {
    s.slideMs -= dtMs;
    if (s.slideMs <= 0 || Math.abs(s.vx) < T.crawlSpeed) {
      s.pose = input.down || !env.canStand ? "crouch" : "stand";
      s.slideMs = 0;
      events.push("slideEnd");
    }
  } else if (s.pose === "stand" && s.grounded && input.down) {
    if (Math.abs(s.vx) >= T.slideMinSpeed) {
      s.pose = "slide";
      s.slideMs = T.slideMs;
      s.vx = s.facing * T.slideSpeed;
      events.push("slideStart");
    } else {
      s.pose = "crouch";
      events.push("crouch");
    }
  } else if (s.pose === "crouch" && !input.down && env.canStand) {
    s.pose = "stand";
    events.push("stand");
  }

  // Charge (crouched, grounded, not crawling)
  if (s.pose === "crouch" && s.grounded && dir === 0) {
    const before = s.chargeMs;
    s.chargeMs = Math.min(T.chargeMaxMs, s.chargeMs + dtMs);
    if (before < T.chargeMinMs && s.chargeMs >= T.chargeMinMs) events.push("chargeReady");
  } else if (!(s.pose === "crouch" && s.grounded && s.jumpBufferMs > 0)) {
    s.chargeMs = 0;
  }

  // Horizontal
  if (s.pose === "slide") {
    s.vx = approach(s.vx, 0, T.slideFriction * dt);
  } else if (stunned) {
    s.vx = approach(s.vx, 0, T.airDecel * dt);
  } else {
    const max = s.pose === "crouch" ? T.crawlSpeed : T.runSpeed;
    const target = dir * max;
    let accel = s.grounded
      ? dir !== 0 ? T.groundAccel : T.groundDecel
      : dir !== 0 ? T.airAccel : T.airDecel;
    if (dir !== 0 && s.vx !== 0 && Math.sign(s.vx) !== dir) accel *= T.turnMult;
    if (s.grounded && env.slippery) accel *= dir !== 0 ? T.gooAccelMult : T.gooDecelMult;
    s.vx = approach(s.vx, target, accel * dt);
  }

  // Jump
  let jumped = false;
  if (s.jumpBufferMs > 0 && (s.grounded || s.coyoteMs > 0)) {
    const charged = s.pose === "crouch" && s.chargeMs >= T.chargeMinMs;
    if (charged) {
      const t = (s.chargeMs - T.chargeMinMs) / (T.chargeMaxMs - T.chargeMinMs);
      s.vy = -(T.jumpVelocity + (T.chargedJumpVelocity - T.jumpVelocity) * t);
      events.push("chargedJump");
    } else {
      s.vy = -T.jumpVelocity;
      events.push("jump");
    }
    if (s.pose !== "stand" && env.canStand) s.pose = "stand";
    s.slideMs = 0;
    s.chargeMs = 0;
    s.jumpBufferMs = 0;
    s.coyoteMs = 0;
    s.grounded = false;
    s.rising = true;
    jumped = true;
  }

  // Variable jump height
  if (s.rising && !jumped) {
    if (s.vy >= 0) {
      s.rising = false;
    } else if (!jumpNow) {
      s.vy *= T.jumpCutMult;
      s.rising = false;
    }
  }

  // Gravity
  if (!jumped) {
    if (s.grounded) {
      s.vy = T.groundStick;
    } else {
      const g = s.vy > 0 ? T.gravity * T.fallGravityMult : T.gravity;
      s.vy = Math.min(T.maxFallSpeed, s.vy + g * dt);
    }
  }

  return { state: s, events };
}
