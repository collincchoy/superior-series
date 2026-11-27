/**
 * On-screen touch controls: layout + "which buttons are pressed" from the
 * current finger positions. Pure (positions are in game coordinates,
 * 1280×720); the HUD draws the buttons and feeds pointer positions in.
 *
 * Each frame we look at where every finger is *now* (not where it first
 * touched), so a thumb sliding from ◀ to ▶ switches direction naturally.
 */
import { emptyInput, type Action, type PlayerInput } from "./input.js";

export interface TouchButton {
  id: Extract<Action, "left" | "right" | "down" | "jump" | "attack" | "special">;
  label: string;
  x: number;
  y: number;
  /** Drawn radius. */
  r: number;
  /** Touch radius — a little bigger than the art, for small, imprecise thumbs. */
  hitR: number;
}

const FORGIVE = 12;
const button = (id: TouchButton["id"], label: string, x: number, y: number, r: number): TouchButton => ({
  id,
  label,
  x,
  y,
  r,
  hitR: r + FORGIVE,
});

export const TOUCH_BUTTONS: readonly TouchButton[] = [
  // Left thumb: move + crouch
  button("left", "◀", 115, 610, 80),
  button("right", "▶", 305, 610, 80),
  button("down", "▼", 210, 455, 58),
  // Right thumb: jump (biggest), whip, fire
  button("jump", "JUMP", 1165, 595, 92),
  button("attack", "WHIP", 975, 630, 66),
  button("special", "FIRE", 1010, 450, 56),
];

export function touchButtonAt(x: number, y: number): TouchButton | null {
  for (const b of TOUCH_BUTTONS) {
    if (Math.hypot(x - b.x, y - b.y) <= b.hitR) return b;
  }
  return null;
}

export function inputFromTouches(
  points: readonly { x: number; y: number }[],
  opts: { fireEnabled?: boolean } = {},
): PlayerInput {
  const input = emptyInput();
  for (const p of points) {
    const b = touchButtonAt(p.x, p.y);
    if (!b) continue;
    if (b.id === "special" && !opts.fireEnabled) continue;
    input[b.id] = true;
  }
  return input;
}

/** Combine keyboard and touch: an action is on if either says so. */
export function mergeInputs(a: PlayerInput, b: PlayerInput): PlayerInput {
  const out = emptyInput();
  for (const k of Object.keys(out) as Action[]) out[k] = a[k] || b[k];
  return out;
}
