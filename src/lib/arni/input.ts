/**
 * Device-independent player input. Game logic only ever sees `PlayerInput`;
 * keyboard / touch / (future) gamepad adapters produce it, one per player.
 */

export const ACTIONS = [
  "left",
  "right",
  "up",
  "down",
  "jump",
  "attack",
  "special",
] as const;
export type Action = (typeof ACTIONS)[number];

export type PlayerInput = Record<Action, boolean>;

export function emptyInput(): PlayerInput {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    attack: false,
    special: false,
  };
}

/** Phaser key names (Phaser.Input.Keyboard.KeyCodes) for player 1. */
export const KEYBOARD_BINDINGS: Record<Action, readonly string[]> = {
  left: ["LEFT", "A"],
  right: ["RIGHT", "D"],
  up: ["UP", "W"],
  down: ["DOWN", "S"],
  jump: ["SPACE", "Z"],
  attack: ["J", "X"],
  special: ["K", "C"],
};

/** Build a PlayerInput from a "is this key held?" lookup. */
export function inputFromPressed(
  isDown: (key: string) => boolean,
  bindings: Record<Action, readonly string[]> = KEYBOARD_BINDINGS,
): PlayerInput {
  const input = emptyInput();
  for (const action of ACTIONS) {
    input[action] = bindings[action].some(isDown);
  }
  return input;
}
