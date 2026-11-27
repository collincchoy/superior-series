/**
 * The 10 levels, in order. Difficulty also sets how tough Rex is (bossConfig).
 * Levels 1–5: the volcanic jungle. Levels 6–10: Rex's Banana Factory.
 */
import { LEVEL_01 } from "./level01.js";
import { LEVEL_02 } from "./level02.js";
import { LEVEL_03 } from "./level03.js";
import { LEVEL_04 } from "./level04.js";
import { LEVEL_05 } from "./level05.js";
import { LEVEL_06 } from "./level06.js";
import { LEVEL_07 } from "./level07.js";
import { LEVEL_08 } from "./level08.js";
import { LEVEL_09 } from "./level09.js";
import { LEVEL_10 } from "./level10.js";

export type { Theme } from "../../assets.js";
import type { Theme } from "../../assets.js";

export interface LevelDef {
  number: number;
  name: string;
  theme: Theme;
  /** Final level: Rex starts on the throne, guarded by the minions in the arena. */
  rexOnThrone: boolean;
  /** 1–10; scales Rex. */
  difficulty: number;
  rows: readonly string[];
}

const def = (number: number, name: string, theme: Theme, rows: readonly string[]): LevelDef => ({
  number,
  name,
  theme,
  difficulty: number,
  rows,
  rexOnThrone: number === 10,
});

export const LEVELS: readonly LevelDef[] = [
  def(1, "Sunny Start", "volcano", LEVEL_01),
  def(2, "Branch Hop", "volcano", LEVEL_02),
  def(3, "Thorny Trail", "volcano", LEVEL_03),
  def(4, "Lava Lake", "volcano", LEVEL_04),
  def(5, "Volcano Peak", "volcano", LEVEL_05),
  def(6, "Factory Gates", "factory", LEVEL_06),
  def(7, "Crate Canyon", "factory", LEVEL_07),
  def(8, "Peel Plant", "factory", LEVEL_08),
  def(9, "Rotten Row", "factory", LEVEL_09),
  def(10, "Rex's Throne", "factory", LEVEL_10),
];
