/** Pause menu model. */

export type PauseOptionId = "resume" | "checkpoint" | "restart";

export const PAUSE_OPTIONS: readonly { id: PauseOptionId; label: string }[] = [
  { id: "resume", label: "Keep Playing" },
  { id: "checkpoint", label: "Back to Checkpoint" },
  { id: "restart", label: "Restart Level" },
];

export function moveSelection(index: number, delta: number, count: number): number {
  return (((index + delta) % count) + count) % count;
}
