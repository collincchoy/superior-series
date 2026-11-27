/**
 * Saved progress (in the browser's localStorage): which levels are unlocked
 * and the best result per level. Corrupt, missing or blocked storage always
 * falls back to a fresh save rather than breaking the game.
 */
import type { Trophies } from "./victory.js";

const KEY = "arni-save";
const VERSION = 1;

export interface LevelBest {
  eggs: number;
  coins: number;
  trophies: Trophies;
}

export interface SaveData {
  version: number;
  /** How many levels are playable (level indexes 0..unlocked-1). */
  unlocked: number;
  /** Best result per level index. */
  best: Record<number, LevelBest>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function emptySave(): SaveData {
  return { version: VERSION, unlocked: 1, best: {} };
}

export function isUnlocked(s: SaveData, levelIndex: number): boolean {
  return levelIndex < s.unlocked;
}

export function recordWin(s: SaveData, levelIndex: number, result: LevelBest): SaveData {
  const prev = s.best[levelIndex];
  const best: LevelBest = prev
    ? {
        eggs: Math.max(prev.eggs, result.eggs),
        coins: Math.max(prev.coins, result.coins),
        trophies: {
          rex: prev.trophies.rex || result.trophies.rex,
          eggs: prev.trophies.eggs || result.trophies.eggs,
          coins: prev.trophies.coins || result.trophies.coins,
        },
      }
    : result;
  return {
    ...s,
    unlocked: Math.max(s.unlocked, levelIndex + 2),
    best: { ...s.best, [levelIndex]: best },
  };
}

export function loadSave(storage: StorageLike, levelCount = Infinity): SaveData {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return emptySave();
    const data = JSON.parse(raw) as Partial<SaveData>;
    if (data.version !== VERSION || typeof data.unlocked !== "number" || typeof data.best !== "object" || !data.best) {
      return emptySave();
    }
    return { version: VERSION, unlocked: Math.max(1, Math.min(levelCount, Math.floor(data.unlocked))), best: data.best };
  } catch {
    return emptySave();
  }
}

export function storeSave(storage: StorageLike, s: SaveData): void {
  try {
    storage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage full or blocked (e.g. private browsing): progress just won't persist.
  }
}
