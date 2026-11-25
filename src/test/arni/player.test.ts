import { describe, it, expect } from "vitest";
import {
  bodyFor,
  initialPlayer,
  stepPlayer,
  type PlayerEnv,
  type PlayerEvent,
  type PlayerState,
} from "../../lib/arni/player.js";
import { emptyInput, type PlayerInput } from "../../lib/arni/input.js";
import { TUNING as T } from "../../lib/arni/tuning.js";
import { TILE_SIZE } from "../../lib/arni/constants.js";

const DT = 1000 / 60;

function input(partial: Partial<PlayerInput> = {}): PlayerInput {
  return { ...emptyInput(), ...partial };
}

/**
 * Tiny physics stand-in: the floor is at y=0 when `floor` is true.
 * Integrates position from the velocities stepPlayer returns and reports
 * grounded/velocity back, the way Arcade physics would.
 */
class Sim {
  state: PlayerState = initialPlayer();
  y = 0; // feet height above floor (0 = on floor), positive = up
  floor = true;
  canStand = true;
  events: PlayerEvent[] = [];
  maxHeight = 0;

  constructor() {
    this.state = { ...this.state, grounded: true };
  }

  step(inp: PlayerInput, frames = 1): this {
    for (let i = 0; i < frames; i++) {
      const grounded = this.floor && this.y <= 0;
      let vy = this.state.vy;
      if (grounded && vy > 0) vy = 0; // floor collision stops downward motion
      const env: PlayerEnv = {
        grounded,
        canStand: this.canStand,
        vx: this.state.vx,
        vy,
      };
      const r = stepPlayer(this.state, inp, env, DT);
      this.state = r.state;
      this.events.push(...r.events);
      this.y -= (this.state.vy * DT) / 1000;
      if (this.floor && this.y < 0) this.y = 0;
      this.maxHeight = Math.max(this.maxHeight, this.y);
    }
    return this;
  }
}

describe("running", () => {
  it("accelerates toward max run speed without exceeding it", () => {
    const sim = new Sim().step(input({ right: true }), 3);
    expect(sim.state.vx).toBeGreaterThan(0);
    expect(sim.state.vx).toBeLessThan(T.runSpeed);
    sim.step(input({ right: true }), 120);
    expect(sim.state.vx).toBeCloseTo(T.runSpeed, 5);
  });

  it("slows to a stop with no input", () => {
    const sim = new Sim().step(input({ right: true }), 60).step(input(), 60);
    expect(sim.state.vx).toBe(0);
  });

  it("faces the direction of input", () => {
    const sim = new Sim().step(input({ left: true }), 1);
    expect(sim.state.facing).toBe(-1);
    sim.step(input({ right: true }), 1);
    expect(sim.state.facing).toBe(1);
  });

  it("presses the body into the ground while grounded so contact persists", () => {
    const sim = new Sim().step(input(), 2);
    expect(sim.state.vy).toBeGreaterThan(0);
    expect(sim.state.vy).toBeLessThan(200);
  });
});

describe("jumping", () => {
  it("jumps on a fresh press while grounded", () => {
    const sim = new Sim().step(input({ jump: true }));
    expect(sim.state.vy).toBe(-T.jumpVelocity);
    expect(sim.events).toContain("jump");
  });

  it("up also jumps", () => {
    const sim = new Sim().step(input({ up: true }));
    expect(sim.events).toContain("jump");
  });

  it("holding jump does not re-jump on landing", () => {
    const sim = new Sim().step(input({ jump: true }), 120);
    expect(sim.events.filter((e) => e === "jump")).toHaveLength(1);
  });

  it("releasing jump early gives a lower jump than holding", () => {
    const tap = new Sim().step(input({ jump: true }), 3).step(input(), 90);
    const hold = new Sim().step(input({ jump: true }), 90);
    expect(tap.maxHeight).toBeLessThan(hold.maxHeight * 0.7);
  });

  it("full jump clears about 2.5–3.5 tiles", () => {
    const sim = new Sim().step(input({ jump: true }), 90);
    expect(sim.maxHeight).toBeGreaterThan(TILE_SIZE * 2.5);
    expect(sim.maxHeight).toBeLessThan(TILE_SIZE * 3.5);
  });

  it("falls faster than it rises (heavier fall gravity)", () => {
    const sim = new Sim();
    sim.state = { ...sim.state, vy: -100 };
    sim.floor = false;
    sim.y = 1000;
    sim.state = { ...sim.state, grounded: false };
    const before = sim.state.vy;
    sim.step(input({ jump: true }), 1);
    const riseDelta = sim.state.vy - before;
    sim.state = { ...sim.state, vy: 100 };
    sim.step(input({ jump: true }), 1);
    const fallDelta = sim.state.vy - 100;
    expect(fallDelta).toBeGreaterThan(riseDelta);
  });

  it("caps fall speed", () => {
    const sim = new Sim();
    sim.floor = false;
    sim.y = 100000;
    sim.step(input(), 300);
    expect(sim.state.vy).toBe(T.maxFallSpeed);
  });

  it("allows a jump shortly after walking off a ledge (coyote time)", () => {
    const sim = new Sim().step(input(), 2);
    sim.floor = false;
    sim.step(input(), 3); // ~50ms airborne
    sim.step(input({ jump: true }));
    expect(sim.events).toContain("jump");
  });

  it("does not allow a jump long after leaving a ledge", () => {
    const sim = new Sim().step(input(), 2);
    sim.floor = false;
    sim.step(input(), 20); // ~333ms airborne
    sim.step(input({ jump: true }));
    expect(sim.events).not.toContain("jump");
  });

  it("buffers a jump pressed just before landing", () => {
    const sim = new Sim();
    sim.floor = true;
    sim.y = 10; // slightly above the floor, falling
    sim.state = { ...sim.state, grounded: false, vy: 400, coyoteMs: 0 };
    sim.step(input({ jump: true }), 1); // press in the air
    expect(sim.events).not.toContain("jump");
    sim.step(input({ jump: true }), 4); // lands within the buffer window
    expect(sim.events).toContain("jump");
  });

  it("emits land when touching down", () => {
    const sim = new Sim().step(input({ jump: true }), 3).step(input(), 90);
    expect(sim.events).toContain("land");
  });
});

describe("crouch and crawl", () => {
  it("crouches when holding down while standing still", () => {
    const sim = new Sim().step(input({ down: true }));
    expect(sim.state.pose).toBe("crouch");
  });

  it("crawls slower than running", () => {
    const sim = new Sim().step(input({ down: true }), 2).step(input({ down: true, right: true }), 120);
    expect(sim.state.vx).toBeCloseTo(T.crawlSpeed, 5);
  });

  it("stands up when down is released", () => {
    const sim = new Sim().step(input({ down: true }), 2).step(input(), 1);
    expect(sim.state.pose).toBe("stand");
  });

  it("stays crouched under a low ceiling even when down is released", () => {
    const sim = new Sim().step(input({ down: true }), 2);
    sim.canStand = false;
    sim.step(input({ right: true }), 10);
    expect(sim.state.pose).toBe("crouch");
    sim.canStand = true;
    sim.step(input(), 1);
    expect(sim.state.pose).toBe("stand");
  });

  it("crouch hitbox fits through a one-tile gap; standing does not", () => {
    expect(bodyFor("crouch").height).toBeLessThan(TILE_SIZE);
    expect(bodyFor("slide").height).toBeLessThan(TILE_SIZE);
    expect(bodyFor("stand").height).toBeGreaterThan(TILE_SIZE);
  });
});

describe("crouch-charged jump", () => {
  it("charges while crouched and still, signalling when ready", () => {
    const sim = new Sim().step(input({ down: true }), Math.ceil(T.chargeMinMs / DT) + 1);
    expect(sim.state.chargeMs).toBeGreaterThanOrEqual(T.chargeMinMs);
    expect(sim.events).toContain("chargeReady");
  });

  it("jumps higher than a normal jump when fully charged", () => {
    const frames = Math.ceil(T.chargeMaxMs / DT) + 2;
    const charged = new Sim().step(input({ down: true }), frames).step(input({ down: true, jump: true }), 120);
    const normal = new Sim().step(input({ jump: true }), 120);
    expect(charged.events).toContain("chargedJump");
    expect(charged.maxHeight).toBeGreaterThan(normal.maxHeight * 1.4);
  });

  it("a quick crouch-jump is just a normal jump", () => {
    const sim = new Sim().step(input({ down: true }), 2).step(input({ down: true, jump: true }), 1);
    expect(sim.events).toContain("jump");
    expect(sim.events).not.toContain("chargedJump");
  });

  it("crawling resets the charge", () => {
    const sim = new Sim()
      .step(input({ down: true }), Math.ceil(T.chargeMaxMs / DT))
      .step(input({ down: true, right: true }), 1);
    expect(sim.state.chargeMs).toBe(0);
  });
});

describe("slide", () => {
  const runUp = () => new Sim().step(input({ right: true }), 60);

  it("pressing down while running fast starts a slide with a speed boost", () => {
    const sim = runUp().step(input({ right: true, down: true }));
    expect(sim.state.pose).toBe("slide");
    expect(sim.events).toContain("slideStart");
    expect(sim.state.vx).toBeGreaterThan(T.runSpeed);
  });

  it("slide ends after its duration, into crouch if down is still held", () => {
    const sim = runUp().step(input({ down: true }), Math.ceil(T.slideMs / DT) + 2);
    expect(sim.events).toContain("slideEnd");
    expect(sim.state.pose).toBe("crouch");
  });

  it("slide ends into stand if down was released and there is room", () => {
    const sim = runUp()
      .step(input({ down: true }), 1)
      .step(input(), Math.ceil(T.slideMs / DT) + 2);
    expect(sim.state.pose).toBe("stand");
  });

  it("can jump out of a slide, keeping momentum", () => {
    const sim = runUp().step(input({ down: true }), 3);
    const vx = sim.state.vx;
    sim.step(input({ jump: true }), 1);
    expect(sim.events).toContain("jump");
    expect(sim.state.pose).toBe("stand");
    expect(sim.state.vx).toBeGreaterThan(T.runSpeed);
    expect(sim.state.vx).toBeLessThanOrEqual(vx);
  });

  it("does not start a slide from a slow walk", () => {
    const sim = new Sim().step(input({ right: true }), 2).step(input({ right: true, down: true }));
    expect(sim.state.pose).toBe("crouch");
  });
});
