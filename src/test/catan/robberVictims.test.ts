import { describe, it, expect } from "vitest";
import { buildGraph } from "../../lib/catan/board.js";
import { createInitialState } from "../../lib/catan/game.js";
import { emptyResources } from "../../lib/catan/types.js";
import type { GameState, HexId, PlayerId, VertexId } from "../../lib/catan/types.js";
import {
  getRobbableVictimPids,
  resolveRobberVictimChoice,
} from "../../lib/catan/robberVictims.js";

const graph = buildGraph();

function makePlayers(count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}` as PlayerId,
    name: `Player ${i + 1}`,
    color: ["#e74c3c", "#3498db", "#f39c12", "#2ecc71"][i]!,
    isBot: false,
  }));
}

function withResources(state: GameState, pid: PlayerId, amount: number): GameState {
  return {
    ...state,
    players: {
      ...state.players,
      [pid]: {
        ...state.players[pid]!,
        resources: {
          ...emptyResources(),
          grain: amount,
        },
      },
    },
  };
}

describe("robber victim selection", () => {
  it("returns unique adjacent opponents with at least one resource card", () => {
    const base = createInitialState(makePlayers(3));
    const hid = Object.keys(base.board.hexes)[0] as HexId;
    const [v1, v2, v3, v4] = graph.verticesOfHex[hid] as VertexId[];

    const state: GameState = {
      ...base,
      board: {
        ...base.board,
        vertices: {
          ...base.board.vertices,
          [v1]: { type: "settlement", playerId: "p2" },
          [v2]: {
            type: "city",
            playerId: "p2",
            hasWall: false,
            metropolis: null,
          },
          [v3]: { type: "settlement", playerId: "p3" },
          [v4]: { type: "settlement", playerId: "p1" },
        },
      },
    };

    const withCards = withResources(withResources(state, "p2", 2), "p3", 0);

    expect(getRobbableVictimPids(withCards, "p1", hid, graph)).toEqual(["p2"]);
  });

  it("resolves immediate no-steal when there are no eligible victims", () => {
    const base = createInitialState(makePlayers(3));
    const hid = Object.keys(base.board.hexes)[0] as HexId;

    expect(resolveRobberVictimChoice(base, "p1", hid, graph)).toEqual({
      kind: "immediate",
      stealFrom: null,
    });
  });

  it("resolves immediate steal when exactly one victim is eligible", () => {
    const base = createInitialState(makePlayers(3));
    const hid = Object.keys(base.board.hexes)[0] as HexId;
    const [v1] = graph.verticesOfHex[hid] as VertexId[];

    const state = withResources(
      {
        ...base,
        board: {
          ...base.board,
          vertices: {
            ...base.board.vertices,
            [v1]: { type: "settlement", playerId: "p2" },
          },
        },
      },
      "p2",
      3,
    );

    expect(resolveRobberVictimChoice(state, "p1", hid, graph)).toEqual({
      kind: "immediate",
      stealFrom: "p2",
    });
  });

  it("returns choose state when multiple victims are eligible", () => {
    const base = createInitialState(makePlayers(3));
    const hid = Object.keys(base.board.hexes)[0] as HexId;
    const [v1, v2] = graph.verticesOfHex[hid] as VertexId[];

    let state: GameState = {
      ...base,
      board: {
        ...base.board,
        vertices: {
          ...base.board.vertices,
          [v1]: { type: "settlement", playerId: "p2" },
          [v2]: { type: "settlement", playerId: "p3" },
        },
      },
    };
    state = withResources(withResources(state, "p2", 2), "p3", 1);

    expect(resolveRobberVictimChoice(state, "p1", hid, graph)).toEqual({
      kind: "choose",
      victims: ["p2", "p3"],
    });
  });
});
