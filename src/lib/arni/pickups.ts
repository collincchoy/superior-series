/** Coins and hidden dino eggs. */
import type { Level } from "./level/parseLevel.js";

export interface Score {
  coins: number;
  eggs: number;
  eggsTotal: number;
}

export function initialScore(level: Level): Score {
  return { coins: 0, eggs: 0, eggsTotal: level.spawns.filter((s) => s.kind === "egg").length };
}

export function addCoins(s: Score, n: number): Score {
  return { ...s, coins: s.coins + n };
}

export function collectEgg(s: Score): Score {
  return { ...s, eggs: Math.min(s.eggsTotal, s.eggs + 1) };
}
