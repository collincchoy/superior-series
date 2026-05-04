import type { PendingAction } from "./validTargets.js";

export type CompactActionLeftTab = "build" | "knights";

/**
 * Maps pending board picks to the compact ACTION HUD left tabs.
 * Progress-card board picks do not correspond to either strip.
 */
export function compactActionLeftTab(pa: PendingAction | null): CompactActionLeftTab | null {
  if (!pa) return null;
  switch (pa.type) {
    case "build_road":
    case "build_settlement":
    case "build_city":
    case "build_city_wall":
    case "knight_deploy":
      return "build";
    case "activate_knight":
    case "advance_knight_from":
    case "advance_knight_to":
    case "chase_robber_from":
    case "chase_robber_hex":
      return "knights";
    case "progress_select_vertex":
    case "progress_select_knight":
    case "progress_select_hex":
    case "progress_select_edge":
    case "progress_select_hex_pair":
      return null;
  }
}
