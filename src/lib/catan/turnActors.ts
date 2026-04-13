import type { GameState, PlayerId } from "./types.js";

export function getActingPlayerIds(state: GameState): PlayerId[] {
  switch (state.phase) {
    case "DISCARD":
      return Object.keys(state.pendingDiscard?.remaining ?? {}) as PlayerId[];

    case "RESOLVE_PROGRESS_DRAW":
      return [...(state.pendingProgressDraw?.remaining ?? [])];

    case "KNIGHT_DISPLACE_RESPONSE": {
      const displacedPid = state.pendingDisplace?.displacedPlayerId;
      return displacedPid ? [displacedPid] : [];
    }

    case "SCIENCE_SELECT_RESOURCE":
      return state.pendingScienceBonus ? [state.pendingScienceBonus.pid] : [];

    default:
      return [state.currentPlayerId];
  }
}

export function isPlayerActing(state: GameState, pid: PlayerId): boolean {
  return getActingPlayerIds(state).includes(pid);
}
