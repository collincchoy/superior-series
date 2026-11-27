import { describe, it, expect } from "vitest";
import { emptySave, isUnlocked, loadSave, recordWin, storeSave, type SaveData } from "../../lib/arni/save.js";

class FakeStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

const win = (eggs: number, coins: number, trophies = { rex: true, eggs: eggs === 3, coins: coins >= 40 }) => ({
  eggs,
  coins,
  trophies,
});

describe("save data", () => {
  it("starts with only level 1 unlocked", () => {
    const s = emptySave();
    expect(isUnlocked(s, 0)).toBe(true);
    expect(isUnlocked(s, 1)).toBe(false);
  });

  it("beating a level unlocks the next one", () => {
    const s = recordWin(emptySave(), 0, win(1, 10));
    expect(isUnlocked(s, 1)).toBe(true);
    expect(isUnlocked(s, 2)).toBe(false);
  });

  it("replaying an earlier level doesn't re-lock later ones", () => {
    let s = recordWin(emptySave(), 0, win(1, 10));
    s = recordWin(s, 1, win(1, 10));
    s = recordWin(s, 0, win(0, 0));
    expect(isUnlocked(s, 2)).toBe(true);
  });

  it("keeps the best eggs/coins and any trophy ever earned per level", () => {
    let s = recordWin(emptySave(), 0, win(3, 10));
    s = recordWin(s, 0, win(1, 50));
    expect(s.best[0]).toEqual({ eggs: 3, coins: 50, trophies: { rex: true, eggs: true, coins: true } });
  });

  it("round-trips through storage", () => {
    const store = new FakeStorage();
    const s = recordWin(emptySave(), 0, win(2, 12));
    storeSave(store, s);
    expect(loadSave(store)).toEqual(s);
  });

  it("falls back to a fresh save on missing or corrupt data", () => {
    const store = new FakeStorage();
    expect(loadSave(store)).toEqual(emptySave());
    store.setItem("arni-save", "{not json");
    expect(loadSave(store)).toEqual(emptySave());
    store.setItem("arni-save", JSON.stringify({ version: 999, unlocked: 5 }));
    expect(loadSave(store)).toEqual(emptySave());
  });

  it("clamps a tampered unlock count to the real number of levels", () => {
    const store = new FakeStorage();
    const bad: SaveData = { ...emptySave(), unlocked: 99 };
    store.setItem("arni-save", JSON.stringify(bad));
    expect(loadSave(store, 10).unlocked).toBe(10);
  });

  it("survives storage that throws (e.g. private browsing)", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadSave(broken)).toEqual(emptySave());
    expect(() => storeSave(broken, emptySave())).not.toThrow();
  });
});
