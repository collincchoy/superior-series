import type { Resources } from "../../lib/catan/types.js";
import { RESOURCE_KEYS, totalCards } from "../../lib/catan/types.js";

export { RESOURCE_KEYS, totalCards };

export const CARD_GRADIENTS: Record<keyof Resources, [string, string]> = {
  brick: ["#c8622a", "#8a3010"],
  lumber: ["#2d7a2d", "#154810"],
  ore: ["#8a8a8a", "#505050"],
  grain: ["#d4b800", "#8a7200"],
  wool: ["#6dbf6d", "#3a8a3a"],
  cloth: ["#f5cc30", "#a07800"],
  coin: ["#3a7ef0", "#1040a0"],
  paper: ["#2e9e4f", "#145a20"],
};

export const CARD_EMOJI: Record<keyof Resources, string> = {
  brick: "🧱",
  lumber: "🪵",
  ore: "🪨",
  grain: "🌾",
  wool: "🐑",
  cloth: "📜",
  coin: "🪙",
  paper: "📄",
};
