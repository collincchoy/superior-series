/**
 * seatStorage.ts — remember which seat (pid) this browser holds in a room.
 *
 * Saved in both sessionStorage (per tab, survives reload) and localStorage
 * (survives iOS PWA relaunch / tab discard, but shared by every tab). Because
 * localStorage is shared, a seat is saved with the player's name and is only
 * reused when the name matches, so a second tab joining as someone else
 * doesn't claim the first tab's seat.
 */
import type { PlayerId } from "./types.js";
import { sameName } from "./network.js";

type StorageLike = Pick<Storage, "getItem" | "setItem">;
export interface SeatStores {
  session: StorageLike;
  local: StorageLike;
}

interface SavedSeat {
  pid: PlayerId;
  name: string;
}

function seatKey(roomCode: string) {
  return `catan-pid-${roomCode}`;
}

function read(store: StorageLike, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function parse(raw: string | null): SavedSeat | PlayerId | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SavedSeat>;
    if (v && typeof v.pid === "string" && typeof v.name === "string") {
      return { pid: v.pid, name: v.name };
    }
  } catch {
    /* legacy bare pid */
  }
  return raw as PlayerId;
}

export function loadSavedSeat(
  stores: SeatStores,
  roomCode: string,
  name: string,
): PlayerId | null {
  const key = seatKey(roomCode);
  const fromSession = parse(read(stores.session, key));
  // A bare pid in this tab's own sessionStorage is trustworthy (legacy).
  if (typeof fromSession === "string") return fromSession;
  for (const saved of [fromSession, parse(read(stores.local, key))]) {
    if (saved && typeof saved === "object" && sameName(saved.name, name)) {
      return saved.pid;
    }
  }
  return null;
}

export function saveSeat(
  stores: SeatStores,
  roomCode: string,
  pid: PlayerId,
  name: string,
) {
  const value = JSON.stringify({ pid, name } satisfies SavedSeat);
  for (const store of [stores.session, stores.local]) {
    try {
      store.setItem(seatKey(roomCode), value);
    } catch {
      /* storage unavailable (private mode) — host falls back to name match */
    }
  }
}

/** Stable random id for this tab, so the host can recognise it on rejoin. */
export function getOrCreateClientId(session: StorageLike): string {
  const key = "catan-client-id";
  const existing = read(session, key);
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    session.setItem(key, id);
  } catch {
    /* fine: id lasts for this page load only */
  }
  return id;
}
