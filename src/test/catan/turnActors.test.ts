import { describe, expect, it } from "vitest";
import { createInitialState } from "../../lib/catan/game.js";
import { getActingPlayerIds } from "../../lib/catan/turnActors.js";

function makePlayers(count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    color: ["#e74c3c", "#3498db", "#f39c12", "#2ecc71"][i]!,
    isBot: false,
  }));
}

describe("turn actor resolution", () => {
  it("ignores pending trade offer targets outside ACTION phase", () => {
    const initial = createInitialState(makePlayers(3));
    const state = {
      ...initial,
      phase: "ROLL_DICE" as const,
      currentPlayerId: "p1",
      pendingTradeOffer: {
        initiatorPid: "p1",
        targetPids: ["p2"],
        willingPids: [],
        offer: { brick: 1 },
        want: { ore: 1 },
        autoComplete: false,
      },
    };

    expect(getActingPlayerIds(state)).toEqual(["p1"]);
  });

  it("redirects acting player to opponent during pendingTreasonOpponentRemoveKnight", () => {
    const initial = createInitialState(makePlayers(3));
    const state = {
      ...initial,
      phase: "ACTION" as const,
      currentPlayerId: "p1",
      pendingTreasonOpponentRemoveKnight: {
        initiatorPid: "p1",
        opponentPid: "p2",
      },
    };

    expect(getActingPlayerIds(state)).toEqual(["p2"]);
  });

  it("only exposes the current tied defender during barbarian tie choice", () => {
    const initial = createInitialState(makePlayers(3));
    const state = {
      ...initial,
      phase: "RESOLVE_BARBARIAN_TIE_DRAW" as const,
      pendingBarbarianTieDraw: {
        remaining: ["p2", "p3"],
      },
    };

    expect(getActingPlayerIds(state)).toEqual(["p2"]);
  });
});
