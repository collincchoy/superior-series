import type { GameState, PlayerId, TurnPhase } from "../../lib/catan/types.js";
import { isPlayerActing } from "../../lib/catan/turnActors.js";

export function phaseLabel(state: GameState, localPid: PlayerId): string {
  const isMe = isPlayerActing(state, localPid);
  const name = state.players[state.currentPlayerId]?.name ?? "";
  const prefix = isMe ? "Your turn" : `${name}'s turn`;

  const labels: Partial<Record<TurnPhase, string>> = {
    SETUP_R1_SETTLEMENT: `${prefix} — Place settlement`,
    SETUP_R1_ROAD: `${prefix} — Place road`,
    SETUP_R2_CITY: `${prefix} — Place city`,
    SETUP_R2_ROAD: `${prefix} — Place road`,
    ROLL_DICE: `${prefix} — Roll dice`,
    ACTION: `${prefix} — Build or trade`,
    DISCARD: isMe ? "Discard cards!" : "Waiting for discards…",
    ROBBER_MOVE: `${prefix} — Move the robber`,
    RESOLVE_BARBARIANS: "Barbarian attack!",
    RESOLVE_PROGRESS_DRAW: isMe
      ? "Draw a progress card"
      : "Waiting for progress card draws…",
    KNIGHT_DISPLACE_RESPONSE: isMe
      ? "Move your displaced knight"
      : "Waiting for displaced knight move…",
    GAME_OVER: state.winner
      ? `${state.players[state.winner]?.name ?? "Unknown"} wins! 🎉`
      : "Game over",
  };
  return labels[state.phase] ?? prefix;
}
