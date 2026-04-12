import { describe, it, expect } from "vitest";
import { createInitialState, applyAction } from "../../lib/catan/game.js";
import { buildGraph, CATAN_HEX_COORDS, hexId } from "../../lib/catan/board.js";
import type { GameState, PlayerId, VertexId } from "../../lib/catan/types.js";

const graph = buildGraph();

function makePlayers(count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    color: ["#e74c3c", "#3498db", "#f39c12"][i]!,
    isBot: false,
  }));
}

/** Build a state in ACTION phase with barbarian at a given position */
function stateWithBarbarian(
  barbarianPos: number,
  robberActive = false,
): GameState {
  const base = createInitialState(makePlayers(3));
  // Skip setup by force-setting phase to ACTION
  return {
    ...base,
    phase: "ACTION" as const,
    barbarian: { position: barbarianPos, robberActive },
  };
}

/** Build state with cities placed for specific players */
function stateWithCities(cityMap: Record<PlayerId, number>): GameState {
  let state = stateWithBarbarian(0);
  const allVertices = Object.keys(graph.vertices) as VertexId[];
  let vIdx = 0;

  for (const [pid, count] of Object.entries(cityMap)) {
    for (let i = 0; i < count; i++) {
      // Find a free vertex
      let vid: VertexId | null = null;
      for (let j = vIdx; j < allVertices.length; j++) {
        const v = allVertices[j]!;
        if (state.board.vertices[v] === null) {
          const adj = graph.adjacentVertices[v] ?? [];
          if (adj.every((a) => state.board.vertices[a] === null)) {
            vid = v;
            vIdx = j + 1;
            break;
          }
        }
      }
      if (!vid) continue;
      state = {
        ...state,
        board: {
          ...state.board,
          vertices: {
            ...state.board.vertices,
            [vid]: {
              type: "city" as const,
              playerId: pid,
              hasWall: false,
              metropolis: null,
            },
          },
        },
      };
    }
  }
  return state;
}

/** Set active knights for a player at new vertices */
function addActiveKnights(
  state: GameState,
  pid: PlayerId,
  strength: 1 | 2 | 3,
  count: number,
): GameState {
  const allVertices = Object.keys(graph.vertices) as VertexId[];
  let vIdx = 0;
  for (let i = 0; i < count; i++) {
    let vid: VertexId | null = null;
    for (let j = vIdx; j < allVertices.length; j++) {
      const v = allVertices[j]!;
      if (state.board.vertices[v] === null && state.board.knights[v] === null) {
        vid = v;
        vIdx = j + 1;
        break;
      }
    }
    if (!vid) break;
    state = {
      ...state,
      board: {
        ...state.board,
        knights: {
          ...state.board.knights,
          [vid]: { playerId: pid, strength, active: true },
        },
      },
    };
  }
  return state;
}

// ─── Barbarian Track ──────────────────────────────────────────────────────────

describe("barbarian track", () => {
  it("advances on event die ship face", () => {
    const state = stateWithBarbarian(2);
    state.phase = "ROLL_DICE" as any;
    const rolled = applyAction(
      { ...state, phase: "ROLL_DICE" },
      {
        type: "ROLL_DICE",
        pid: "p1",
        result: [2, 3, "ship"],
      },
    );
    // Ship should advance: position goes from 2 to 3
    expect(rolled.barbarian.position).toBe(3);
  });

  it("does NOT advance on color event die face", () => {
    const state = { ...stateWithBarbarian(2), phase: "ROLL_DICE" as const };
    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid: "p1",
      result: [2, 3, "science"],
    });
    expect(rolled.barbarian.position).toBe(2);
  });

  it("triggers attack at position 7", () => {
    const state = { ...stateWithBarbarian(6), phase: "ROLL_DICE" as const };
    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid: "p1",
      result: [2, 3, "ship"],
    });
    // After attack, barbarian should reset to 0
    expect(rolled.barbarian.position).toBe(0);
  });

  it("does NOT trigger attack at position 6", () => {
    const state = { ...stateWithBarbarian(5), phase: "ROLL_DICE" as const };
    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid: "p1",
      result: [2, 3, "ship"],
    });
    expect(rolled.barbarian.position).toBe(6);
  });
});

// ─── Barbarian Attack: Defenders Win ──────────────────────────────────────────

describe("barbarian attack - defenders win", () => {
  it("defenders win: active knight strength >= city count", () => {
    // 2 cities, 3 active knight strength → defenders win
    let state = stateWithCities({ p1: 2 });
    state = addActiveKnights(state, "p1", 2, 2); // strength sum = 4
    state = {
      ...state,
      phase: "ROLL_DICE" as const,
      barbarian: { position: 6, robberActive: false },
    };

    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid: "p1",
      result: [2, 3, "ship"],
    });
    // Cities should NOT be pillaged
    const cityCount = Object.values(rolled.board.vertices).filter(
      (b) => b?.type === "city",
    ).length;
    expect(cityCount).toBe(2);
  });

  it("single defender winner gets 1 VP token", () => {
    // p1 has 3 active knight strength, p2 has 0 → p1 wins alone
    let state = stateWithCities({ p1: 1 });
    state = addActiveKnights(state, "p1", 3, 1); // strength = 3
    state = {
      ...state,
      phase: "ROLL_DICE" as const,
      barbarian: { position: 6, robberActive: false },
    };

    const before = state.players["p1"]!.vpTokens;
    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid: "p1",
      result: [2, 3, "ship"],
    });
    expect(rolled.players["p1"]!.vpTokens).toBe(before + 1);
  });

  it("tied defenders each draw one progress card", () => {
    // p1 and p2 each have equal knight strength
    let state = stateWithCities({ p1: 1 });
    state = addActiveKnights(state, "p1", 2, 1); // p1: strength 2
    state = addActiveKnights(state, "p2", 2, 1); // p2: strength 2
    state = {
      ...state,
      phase: "ROLL_DICE" as const,
      barbarian: { position: 6, robberActive: false },
    };

    const p1Before = state.players["p1"]!.progressCards.length;
    const p2Before = state.players["p2"]!.progressCards.length;

    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid: "p1",
      result: [2, 3, "ship"],
    });

    // Neither gets VP token; both should draw one progress card
    expect(rolled.players["p1"]!.vpTokens).toBe(0);
    expect(rolled.players["p2"]!.vpTokens).toBe(0);
    expect(rolled.players["p1"]!.progressCards.length).toBe(p1Before + 1);
    expect(rolled.players["p2"]!.progressCards.length).toBe(p2Before + 1);
  });

  it("all active knights become inactive after attack", () => {
    let state = stateWithCities({ p1: 1 });
    state = addActiveKnights(state, "p1", 2, 2);
    state = {
      ...state,
      phase: "ROLL_DICE" as const,
      barbarian: { position: 6, robberActive: false },
    };

    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid: "p1",
      result: [2, 3, "ship"],
    });
    for (const knight of Object.values(rolled.board.knights)) {
      if (knight) expect(knight.active).toBe(false);
    }
  });

  it("barbarian track resets to 0 after attack", () => {
    let state = stateWithCities({ p1: 1 });
    state = addActiveKnights(state, "p1", 3, 1);
    state = {
      ...state,
      phase: "ROLL_DICE" as const,
      barbarian: { position: 6, robberActive: false },
    };

    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid: "p1",
      result: [2, 3, "ship"],
    });
    expect(rolled.barbarian.position).toBe(0);
  });
});

// ─── Barbarian Attack: Barbarians Win ─────────────────────────────────────────

describe("barbarian attack - barbarians win", () => {
  it("player with 0 knights loses a city", () => {
    // 2 cities for p1, no active knights
    let state = stateWithCities({ p1: 2 });
    state = {
      ...state,
      phase: "ROLL_DICE" as const,
      barbarian: { position: 6, robberActive: false },
    };

    const before = Object.values(state.board.vertices).filter(
      (b) => b?.type === "city",
    ).length;
    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid: "p1",
      result: [2, 3, "ship"],
    });
    const after = Object.values(rolled.board.vertices).filter(
      (b) => b?.type === "city",
    ).length;
    expect(after).toBeLessThan(before);
  });

  it("pillaged city becomes a settlement", () => {
    let state = stateWithCities({ p1: 1 });
    state = {
      ...state,
      phase: "ROLL_DICE" as const,
      barbarian: { position: 6, robberActive: false },
    };

    const cityVertex = Object.entries(state.board.vertices).find(
      ([, b]) => b?.type === "city",
    )?.[0] as VertexId | undefined;
    if (!cityVertex) return;

    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid: "p1",
      result: [2, 3, "ship"],
    });
    // The city should now be a settlement
    expect(rolled.board.vertices[cityVertex]?.type).toBe("settlement");
  });

  it("metropolis city is NOT pillaged", () => {
    let state = stateWithCities({ p1: 1 });
    // Make the city a metropolis
    const cityVertex = Object.entries(state.board.vertices).find(
      ([, b]) => b?.type === "city",
    )?.[0] as VertexId | undefined;
    if (!cityVertex) return;

    state = {
      ...state,
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [cityVertex]: {
            type: "city",
            playerId: "p1",
            hasWall: false,
            metropolis: "science",
          },
        },
      },
      phase: "ROLL_DICE" as const,
      barbarian: { position: 6, robberActive: false },
    };

    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid: "p1",
      result: [2, 3, "ship"],
    });
    // Metropolis city stays a city
    expect(rolled.board.vertices[cityVertex]?.type).toBe("city");
  });

  it("city wall is removed when city is pillaged", () => {
    // Place a city with a wall
    let state = stateWithBarbarian(0);
    const allVertices = Object.keys(graph.vertices) as VertexId[];
    const vid = allVertices[0]! as VertexId;
    state = {
      ...state,
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [vid]: {
            type: "city",
            playerId: "p1",
            hasWall: true,
            metropolis: null,
          },
        },
      },
      phase: "ROLL_DICE" as const,
      barbarian: { position: 6, robberActive: false },
    };

    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid: "p1",
      result: [2, 3, "ship"],
    });
    // City becomes settlement (which never has walls)
    expect(rolled.board.vertices[vid]?.type).toBe("settlement");
  });

  it("first barbarian attack activates the robber on the desert", () => {
    let state = stateWithCities({ p1: 1 });
    state = {
      ...state,
      phase: "ROLL_DICE" as const,
      barbarian: { position: 6, robberActive: false },
    };

    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid: "p1",
      result: [2, 3, "ship"],
    });
    expect(rolled.barbarian.robberActive).toBe(true);
    // Robber should be placed on desert hex
    const desertHex = Object.values(rolled.board.hexes).find(
      (h) => h.terrain === "desert",
    );
    if (desertHex) {
      expect(desertHex.hasRobber).toBe(true);
    }
  });
});
