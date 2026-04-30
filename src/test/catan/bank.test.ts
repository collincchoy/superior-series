import { describe, it, expect } from "vitest";
import { bankRemaining, createInitialState } from "../../lib/catan/game.js";
import { BANK_TOTALS } from "../../lib/catan/constants.js";

const COLORS = ["#e74c3c", "#3498db", "#f39c12", "#2ecc71"];

function makeState(playerCount = 2) {
  return createInitialState(
    Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      color: COLORS[i]!,
      isBot: false,
    })),
  );
}

describe("bankRemaining", () => {
  it("returns BANK_TOTALS when no player holds any resources", () => {
    const state = makeState(2);
    const bank = bankRemaining(state);
    expect(bank).toEqual(BANK_TOTALS);
  });

  it("decrements by the amount each player holds", () => {
    const state = makeState(2);
    state.players["p1"]!.resources.brick = 3;
    state.players["p1"]!.resources.grain = 1;
    state.players["p2"]!.resources.brick = 2;
    state.players["p2"]!.resources.coin = 4;

    const bank = bankRemaining(state);
    expect(bank.brick).toBe(BANK_TOTALS.brick - 5);
    expect(bank.grain).toBe(BANK_TOTALS.grain - 1);
    expect(bank.coin).toBe(BANK_TOTALS.coin - 4);
    expect(bank.lumber).toBe(BANK_TOTALS.lumber);
    expect(bank.ore).toBe(BANK_TOTALS.ore);
    expect(bank.wool).toBe(BANK_TOTALS.wool);
    expect(bank.cloth).toBe(BANK_TOTALS.cloth);
    expect(bank.paper).toBe(BANK_TOTALS.paper);
  });

  it("can return 0 when all of a resource type is held by players", () => {
    const state = makeState(2);
    state.players["p1"]!.resources.wool = BANK_TOTALS.wool;
    const bank = bankRemaining(state);
    expect(bank.wool).toBe(0);
  });
});
