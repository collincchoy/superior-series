import { describe, expect, it } from "vitest";
import {
  CATAN_PROFILE_STORAGE_KEY,
  LEGACY_PLAYER_NAME_STORAGE_KEY,
  loadCatanProfile,
  saveBoardPreset,
  savePlayerName,
  type CatanProfileStorage,
} from "../../lib/catan/profile.js";

class MemoryStorage implements CatanProfileStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("Catan profile preferences", () => {
  it("uses defaults when no profile exists", () => {
    expect(loadCatanProfile(new MemoryStorage())).toEqual({
      playerName: null,
      boardPreset: "A",
    });
  });

  it("loads a saved board preset", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      CATAN_PROFILE_STORAGE_KEY,
      JSON.stringify({ boardPreset: "random" }),
    );

    expect(loadCatanProfile(storage).boardPreset).toBe("random");
  });

  it("falls back to defaults for invalid stored data", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      CATAN_PROFILE_STORAGE_KEY,
      JSON.stringify({ boardPreset: "surprise me", playerName: 7 }),
    );

    expect(loadCatanProfile(storage)).toEqual({
      playerName: null,
      boardPreset: "A",
    });
  });

  it("falls back to the legacy player name key", () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_PLAYER_NAME_STORAGE_KEY, "Collin");

    expect(loadCatanProfile(storage).playerName).toBe("Collin");
  });

  it("persists player names and board presets in one profile", () => {
    const storage = new MemoryStorage();

    savePlayerName("Ava", storage);
    saveBoardPreset("random", storage);

    expect(loadCatanProfile(storage)).toEqual({
      playerName: "Ava",
      boardPreset: "random",
    });
  });
});
