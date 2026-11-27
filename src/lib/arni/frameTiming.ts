/**
 * Game logic runs in lockstep with physics.
 *
 * Arcade physics steps at a fixed rate; the browser draws at the screen's
 * refresh rate. On frames where physics didn't step, contact flags
 * (blocked.down, the mushroom collider…) are left over from the last step,
 * and acting on them cancelled jumps and re-launched the mushroom every
 * frame. So logic only advances by the physics time that actually elapsed.
 */

/** Physics steps per second — at least a 120Hz screen's refresh rate. */
export const PHYSICS_FPS = 120;

/** Max simulated time per frame, so a hitch doesn't launch Arni through floors. */
export const MAX_LOGIC_DT_MS = 50;

export function logicDeltaMs(physicsSteps: number, physicsFps: number = PHYSICS_FPS): number {
  return Math.min((physicsSteps * 1000) / physicsFps, MAX_LOGIC_DT_MS);
}
