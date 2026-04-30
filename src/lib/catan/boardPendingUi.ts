/**
 * Pure helpers for the bottom “what to do on the board” strip (progress follow-ups,
 * free roads/promotions, Treason placement, admin picks).
 */

import type { GameState, PlayerId } from "./types.js";
import type { PendingAction, PendingAdminAction } from "./validTargets.js";
import { bestKnightUpTo } from "./rules.js";
import { isPlayerActing } from "./turnActors.js";

export type BoardPendingBannerModel = {
  message: string;
  skip?:
    | "free_roads"
    | "promotions"
    | "treason"
    | "admin_cancel";
};

function adminMessage(pa: PendingAdminAction): string {
  switch (pa.type) {
    case "admin_move_road_pick_from":
      return "Move Road: select the road to move.";
    case "admin_move_road_pick_to":
      return "Move Road: select destination edge.";
    case "admin_move_building_pick_from":
      return "Move Building: select the building to move.";
    case "admin_move_building_pick_to":
      return "Move Building: select destination vertex.";
    case "admin_move_knight_pick_from":
      return "Move Knight: select the knight to move.";
    case "admin_move_knight_pick_to":
      return "Move Knight: select destination vertex.";
    case "admin_swap_number_pick_a":
      return "Swap Number Tokens: select first numbered hex.";
    case "admin_swap_number_pick_b":
      return "Swap Number Tokens: select second numbered hex.";
    case "admin_swap_hex_pick_a":
      return "Swap Hexes: select first hex.";
    case "admin_swap_hex_pick_b":
      return "Swap Hexes: select second hex.";
  }
}

function progressMessage(pa: PendingAction): string | null {
  switch (pa.type) {
    case "progress_select_vertex":
      return pa.card === "Medicine"
        ? "Medicine: click a settlement to upgrade to a city."
        : "Engineering: click one of your unwalled cities to add a wall.";
    case "progress_select_hex":
      return pa.card === "Merchant"
        ? "Merchant: click a land hex adjacent to your buildings."
        : "Taxation: move the robber to a different land hex.";
    case "progress_select_edge":
      return "Diplomacy: click an open road segment to remove it.";
    case "progress_select_knight":
      return pa.card === "Intrigue"
        ? "Intrigue: click an enemy knight on your road network to displace."
        : "Treason: click an enemy knight to remove.";
    case "progress_select_hex_pair": {
      const step = pa.picked.length === 0 ? 1 : 2;
      return step === 1
        ? "Invention: choose the first numbered hex to swap."
        : "Invention: choose the second numbered hex.";
    }
    default:
      return null;
  }
}

function treasonPlacementMessage(gs: GameState, localPid: PlayerId): string {
  const pt = gs.pendingTreason;
  if (!pt || pt.pid !== localPid) return "";
  const best = bestKnightUpTo(gs.players[localPid]!, pt.maxStrength);
  if (!best) return "Treason: no knights available to place.";
  const label =
    best < pt.maxStrength
      ? `strength ${best} (highest you have ≤ ${pt.maxStrength})`
      : `strength ${best}`;
  return `Treason: click a valid spot to place a ${label} knight, or`;
}

/**
 * Single highest-priority instruction row for board tapping / follow-ups.
 */
export function getBoardPendingUi(
  gs: GameState,
  localPid: PlayerId,
  pendingAction: PendingAction | null,
  pendingAdminAction: PendingAdminAction | null,
): BoardPendingBannerModel | null {
  if (pendingAdminAction) {
    return {
      message: adminMessage(pendingAdminAction),
      skip: "admin_cancel",
    };
  }

  if (gs.pendingFreeRoads?.pid === localPid) {
    return {
      message: "Road Building: click a valid road edge to place it, or",
      skip: "free_roads",
    };
  }

  if (gs.pendingKnightPromotions?.pid === localPid) {
    return {
      message: "Smithing: click a knight to promote it free, or",
      skip: "promotions",
    };
  }

  if (gs.pendingTreason?.pid === localPid) {
    return {
      message: treasonPlacementMessage(gs, localPid),
      skip: "treason",
    };
  }

  if (
    pendingAction &&
    pendingAction.type.startsWith("progress_") &&
    isPlayerActing(gs, localPid)
  ) {
    const msg = progressMessage(pendingAction);
    if (msg) return { message: msg };
  }

  return null;
}
