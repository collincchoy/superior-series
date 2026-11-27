/** End-of-level results. */
import type { Score } from "./pickups.js";

/** Coins needed for the Coin Collector trophy in the test level. */
export const COIN_TROPHY = 40;

export interface Trophies {
  rex: boolean;
  eggs: boolean;
  coins: boolean;
}

export function trophies(score: Score, coinTarget: number): Trophies {
  return {
    rex: true,
    eggs: score.eggsTotal > 0 && score.eggs >= score.eggsTotal,
    coins: score.coins >= coinTarget,
  };
}
