/** Run progress within a level: which checkpoint Arni respawns at. */
import type { Level, TilePos } from "./level/parseLevel.js";

export interface Progress {
  checkpoint: TilePos | null;
}

export function initialProgress(): Progress {
  return { checkpoint: null };
}

export function activateCheckpoint(
  p: Progress,
  at: TilePos,
): { progress: Progress; activated: boolean } {
  if (p.checkpoint && p.checkpoint.tx === at.tx && p.checkpoint.ty === at.ty) {
    return { progress: p, activated: false };
  }
  return { progress: { ...p, checkpoint: { ...at } }, activated: true };
}

export function respawnTile(level: Level, p: Progress): TilePos {
  return p.checkpoint ?? level.playerStart;
}
