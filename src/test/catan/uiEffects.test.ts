import { describe, expect, it } from "vitest";
import { createInitialState } from "../../lib/catan/game.js";
import { buildGraph } from "../../lib/catan/board.js";
import type { GameState, PlayerId, VertexId } from "../../lib/catan/types.js";
import {
  computePlayerCardDeltaEvents,
  getTerrainGlowHexesForPlayer,
} from "../../lib/catan/uiEffects.js";

const graph = buildGraph();

function makePlayers() {
  return [
    { id: "p1", name: "Player 1", color: "#e74c3c", isBot: false },
    { id: "p2", name: "Player 2", color: "#3498db", isBot: false },
  ];
}

function placeSettlement(
  state: GameState,
  pid: PlayerId,
  vid: VertexId,
): GameState {
  return {
    ...state,
    board: {
      ...state.board,
      vertices: {
        ...state.board.vertices,
        [vid]: { type: "settlement", playerId: pid },
      },
    },
  };
}

describe("uiEffects", () => {
  it("computes resource gain/loss deltas per player", () => {
    const initial = createInitialState(makePlayers());
    const prev: GameState = {
      ...initial,
      players: {
        ...initial.players,
        p1: {
          ...initial.players.p1!,
          resources: {
            ...initial.players.p1!.resources,
            ore: 2,
          },
        },
      },
    };
    const next: GameState = {
      ...prev,
      players: {
        ...prev.players,
        p1: {
          ...prev.players.p1!,
          resources: {
            ...prev.players.p1!.resources,
            grain: prev.players.p1!.resources.grain + 2,
            ore: Math.max(0, prev.players.p1!.resources.ore - 1),
          },
        },
        p2: {
          ...prev.players.p2!,
          resources: {
            ...prev.players.p2!.resources,
            lumber: prev.players.p2!.resources.lumber + 1,
          },
        },
      },
    };

    const events = computePlayerCardDeltaEvents(prev, next);

    const p1 = events.find((e) => e.pid === "p1");
    const p2 = events.find((e) => e.pid === "p2");

    expect(p1).toBeTruthy();
    expect(p2).toBeTruthy();
    expect(p1?.tokens).toEqual(
      expect.arrayContaining([
        { kind: "grain", amount: 2 },
        { kind: "ore", amount: -1 },
      ]),
    );
    expect(p2?.tokens).toEqual(
      expect.arrayContaining([{ kind: "lumber", amount: 1 }]),
    );
  });

  it("includes progress card hand deltas", () => {
    const prev = createInitialState(makePlayers());
    const next: GameState = {
      ...prev,
      players: {
        ...prev.players,
        p1: {
          ...prev.players.p1!,
          progressCards: [
            ...prev.players.p1!.progressCards,
            { name: "Mining", track: "science", isVP: false },
          ],
        },
      },
    };

    const events = computePlayerCardDeltaEvents(prev, next);
    const p1 = events.find((e) => e.pid === "p1");

    expect(p1).toBeTruthy();
    expect(p1?.tokens).toEqual(
      expect.arrayContaining([{ kind: "progress", amount: 1 }]),
    );
  });

  it("returns terrain-adjacent hex ids for a player", () => {
    const base = createInitialState(makePlayers());
    const targetHex = Object.values(base.board.hexes).find(
      (h) => h.terrain === "fields",
    );
    expect(targetHex).toBeTruthy();
    if (!targetHex) return;

    const vid = (graph.verticesOfHex[targetHex.id] ?? [])[0] as VertexId;
    expect(vid).toBeTruthy();
    if (!vid) return;

    const withBuilding = placeSettlement(base, "p1", vid);
    const glowHexes = getTerrainGlowHexesForPlayer(
      withBuilding,
      "p1",
      "fields",
    );

    expect(glowHexes).toContain(targetHex.id);
  });
});
