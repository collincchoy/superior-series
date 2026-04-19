import type { GameState, PlayerId } from "./types.js";

export function getActingPlayerIds(state: GameState): PlayerId[] {
  switch (state.phase) {
    case "DISCARD":
      return Object.keys(state.pendingDiscard?.remaining ?? {}) as PlayerId[];

    case "DISCARD_PROGRESS":
      return Object.keys(
        state.pendingProgressDiscard?.remaining ?? {},
      ) as PlayerId[];

    case "RESOLVE_PROGRESS_DRAW":
      return [...(state.pendingProgressDraw?.remaining ?? [])];

    case "KNIGHT_DISPLACE_RESPONSE": {
      const displacedPid = state.pendingDisplace?.displacedPlayerId;
      return displacedPid ? [displacedPid] : [];
    }

    case "SCIENCE_SELECT_RESOURCE":
      return state.pendingScienceBonus ? [state.pendingScienceBonus.pid] : [];

    case "RESOLVE_BARBARIANS":
      // Host-driven: the cinematic plays on every client, then the host alone
      // dispatches EXECUTE_BARBARIAN_ATTACK. No player "acts" in the meantime.
      return [];

    default:
      if (state.pendingTradeOffer) {
        return state.pendingTradeOffer.targetPids;
      }
      return [state.currentPlayerId];
  }
}

export function isPlayerActing(state: GameState, pid: PlayerId): boolean {
  return getActingPlayerIds(state).includes(pid);
}
