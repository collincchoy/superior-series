/** Pause menu model. */

export type PauseOptionId = "resume" | "checkpoint" | "restart" | "levels" | "music" | "sfx";

export const PAUSE_OPTIONS: readonly { id: PauseOptionId; label: string }[] = [
  { id: "resume", label: "Keep Playing" },
  { id: "checkpoint", label: "Back to Checkpoint" },
  { id: "restart", label: "Restart Level" },
  { id: "levels", label: "Level Map" },
  // On/off switches (shown side by side, labels get ": On" / ": Off")
  { id: "music", label: "Music" },
  { id: "sfx", label: "Sounds" },
];

export function moveSelection(index: number, delta: number, count: number): number {
  return (((index + delta) % count) + count) % count;
}
