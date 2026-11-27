import { describe, expect, it } from "vitest";
import {
  getOrCreateClientId,
  loadSavedSeat,
  saveSeat,
} from "../../lib/catan/seatStorage.js";

class MemStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
}

describe("seat storage", () => {
  it("round-trips a seat for the same name (case-insensitive)", () => {
    const session = new MemStorage();
    const local = new MemStorage();
    saveSeat({ session, local }, "room", "player2", "Alice");
    expect(loadSavedSeat({ session, local }, "room", "alice")).toBe("player2");
  });

  it("falls back to localStorage when the tab's sessionStorage is empty (PWA relaunch)", () => {
    const local = new MemStorage();
    saveSeat({ session: new MemStorage(), local }, "room", "player2", "Alice");
    expect(loadSavedSeat({ session: new MemStorage(), local }, "room", "Alice")).toBe("player2");
  });

  it("ignores a shared saved seat recorded under a different name", () => {
    const local = new MemStorage();
    saveSeat({ session: new MemStorage(), local }, "room", "player2", "Alice");
    expect(loadSavedSeat({ session: new MemStorage(), local }, "room", "Bob")).toBeNull();
  });

  it("still accepts a legacy bare pid from this tab's sessionStorage", () => {
    const session = new MemStorage();
    session.setItem("catan-pid-room", "player3");
    expect(loadSavedSeat({ session, local: new MemStorage() }, "room", "Bob")).toBe("player3");
  });

  it("survives storage that throws (private mode)", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(() => saveSeat({ session: broken, local: broken }, "room", "player2", "A")).not.toThrow();
    expect(loadSavedSeat({ session: broken, local: broken }, "room", "A")).toBeNull();
  });

  it("keeps one client id per tab", () => {
    const session = new MemStorage();
    const a = getOrCreateClientId(session);
    expect(a).toMatch(/\S{8,}/);
    expect(getOrCreateClientId(session)).toBe(a);
    expect(getOrCreateClientId(new MemStorage())).not.toBe(a);
  });
});
