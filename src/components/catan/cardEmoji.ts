import type { Resources } from "../../lib/catan/types.js";

export const CARD_EMOJI: Record<keyof Resources, string> = {
  brick: "🧱",
  lumber: "🪵",
  ore: "🪨",
  grain: "🌾",
  wool: "🐑",
  cloth: "🩳",
  coin: "🪙",
  paper: "📄",
};

export const RESOURCE_KEYS: (keyof Resources)[] = [
  "brick",
  "lumber",
  "ore",
  "grain",
  "wool",
  "cloth",
  "coin",
  "paper",
];

export function totalCards(r: Resources): number {
  return (
    r.brick + r.lumber + r.ore + r.grain + r.wool + r.cloth + r.coin + r.paper
  );
}
