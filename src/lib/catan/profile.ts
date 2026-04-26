import type { BoardPreset } from "./game.js";

export const CATAN_PROFILE_STORAGE_KEY = "catan:profile";
export const LEGACY_PLAYER_NAME_STORAGE_KEY = "catan:last-used-player-name";

const DEFAULT_BOARD_PRESET: BoardPreset = "A";

export interface CatanProfile {
  playerName: string | null;
  boardPreset: BoardPreset;
}

export interface CatanProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type StoredCatanProfile = Partial<{
  playerName: unknown;
  boardPreset: unknown;
}>;

function getBrowserStorage(): CatanProfileStorage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function isBoardPreset(value: unknown): value is BoardPreset {
  return value === "A" || value === "random";
}

function readStoredProfile(storage: CatanProfileStorage): StoredCatanProfile {
  const stored = storage.getItem(CATAN_PROFILE_STORAGE_KEY);
  if (!stored) return {};

  try {
    const parsed: unknown = JSON.parse(stored);
    return parsed && typeof parsed === "object"
      ? (parsed as StoredCatanProfile)
      : {};
  } catch {
    return {};
  }
}

function readLegacyPlayerName(storage: CatanProfileStorage): string | null {
  const legacyName = storage.getItem(LEGACY_PLAYER_NAME_STORAGE_KEY);
  return legacyName ? legacyName : null;
}

export function loadCatanProfile(
  storage: CatanProfileStorage | null = getBrowserStorage(),
): CatanProfile {
  if (!storage) {
    return { playerName: null, boardPreset: DEFAULT_BOARD_PRESET };
  }

  const stored = readStoredProfile(storage);
  const playerName =
    typeof stored.playerName === "string" && stored.playerName
      ? stored.playerName
      : readLegacyPlayerName(storage);
  const boardPreset = isBoardPreset(stored.boardPreset)
    ? stored.boardPreset
    : DEFAULT_BOARD_PRESET;

  return { playerName, boardPreset };
}

export function saveCatanProfile(
  patch: Partial<CatanProfile>,
  storage: CatanProfileStorage | null = getBrowserStorage(),
): CatanProfile {
  const next = { ...loadCatanProfile(storage), ...patch };
  if (!storage) return next;

  storage.setItem(CATAN_PROFILE_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function savePlayerName(
  playerName: string,
  storage?: CatanProfileStorage | null,
): CatanProfile {
  return saveCatanProfile({ playerName }, storage);
}

export function saveBoardPreset(
  boardPreset: BoardPreset,
  storage?: CatanProfileStorage | null,
): CatanProfile {
  return saveCatanProfile({ boardPreset }, storage);
}
