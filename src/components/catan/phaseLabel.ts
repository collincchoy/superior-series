import type { GameState, PlayerId, TurnPhase } from "../../lib/catan/types.js";
import { isPlayerActing } from "../../lib/catan/turnActors.js";

export function phaseLabel(state: GameState, localPid: PlayerId): string {
  const isMe = isPlayerActing(state, localPid);
  const name = state.players[state.currentPlayerId]?.name ?? "";
  const prefix = isMe ? "Your turn" : `${name}'s turn`;

  // Pending progress card sub-phases
  if (state.pendingFreeRoads?.pid === localPid) {
    const rem = state.pendingFreeRoads.remaining;
    return `Your turn — Place ${rem} free road${rem > 1 ? "s" : ""} 🛤️`;
  }
  if (state.pendingKnightPromotions?.pid === localPid) {
    const rem = state.pendingKnightPromotions.remaining;
    return `Your turn — Promote ${rem} knight${rem > 1 ? "s" : ""} free ⚔️`;
  }

  const labels: Partial<Record<TurnPhase, string>> = {
    SETUP_R1_SETTLEMENT: `${prefix} — Claim your land 🏠`,
    SETUP_R1_ROAD: `${prefix} — Pave the way 🛤️`,
    SETUP_R2_CITY: `${prefix} — Found your city 🏙️`,
    SETUP_R2_ROAD: `${prefix} — Expand your reach 🛤️`,
    ROLL_DICE: `${prefix} — Roll the dice! 🎲`,
    PRODUCTION: "🌾 Collecting the harvest…",
    ACTION: isMe
      ? `${prefix} — Build your empire! 🏰`
      : `${prefix} — Building…`,
    DISCARD: isMe ? "Too many cards! Discard! 😱" : "Waiting for discards… ⏳",
    ROBBER_MOVE: isMe
      ? `${prefix} — Unleash the robber! 👺`
      : `${prefix} — Moving the robber…`,
    RESOLVE_BARBARIANS: "The barbarians attack! ⚔️🛡️",
    RESOLVE_PROGRESS_DRAW: isMe
      ? "A progress card awaits! 🃏"
      : "Waiting for progress draws… ⏳",
    KNIGHT_DISPLACE_RESPONSE: isMe
      ? "Relocate your displaced knight! ⚔️"
      : "Waiting for knight relocation… ⏳",
    GAME_OVER: state.winner
      ? `👑 ${state.players[state.winner]?.name ?? "Unknown"} wins! All hail! 🎉`
      : "Game over!",
  };
  return labels[state.phase] ?? prefix;
}
