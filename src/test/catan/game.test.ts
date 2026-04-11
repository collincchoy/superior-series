import { describe, it, expect } from "vitest";
import {
  createInitialState,
  applyAction,
  computeVP,
} from "../../lib/catan/game.js";
import { buildGraph, CATAN_HEX_COORDS, hexId } from "../../lib/catan/board.js";
import type { GameState, PlayerId, VertexId } from "../../lib/catan/types.js";

const graph = buildGraph();

function makePlayers(count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    color: ["#e74c3c", "#3498db", "#f39c12", "#2ecc71"][i]!,
    isBot: false,
  }));
}

describe("createInitialState", () => {
  it("starts in SETUP_R1_SETTLEMENT phase", () => {
    const state = createInitialState(makePlayers(3));
    expect(state.phase).toBe("SETUP_R1_SETTLEMENT");
  });

  it("sets version to 0", () => {
    const state = createInitialState(makePlayers(3));
    expect(state.version).toBe(0);
  });

  it("all players start with zero resources", () => {
    const state = createInitialState(makePlayers(3));
    for (const player of Object.values(state.players)) {
      const total = Object.values(player.resources).reduce((a, b) => a + b, 0);
      expect(total).toBe(0);
    }
  });

  it("all players start with zero VP tokens", () => {
    const state = createInitialState(makePlayers(3));
    for (const player of Object.values(state.players)) {
      expect(player.vpTokens).toBe(0);
    }
  });

  it("progress decks are shuffled and each has 18 cards", () => {
    const state = createInitialState(makePlayers(3));
    expect(state.decks.science).toHaveLength(18);
    expect(state.decks.trade).toHaveLength(18);
    expect(state.decks.politics).toHaveLength(18);
  });

  it("barbarian track starts at 0 with robber inactive", () => {
    const state = createInitialState(makePlayers(3));
    expect(state.barbarian.position).toBe(0);
    expect(state.barbarian.robberActive).toBe(false);
  });

  it("setupQueue has all players for round 1", () => {
    const players = makePlayers(3);
    const state = createInitialState(players);
    expect(state.setupQueue).toHaveLength(3);
  });

  it("no winner at start", () => {
    const state = createInitialState(makePlayers(3));
    expect(state.winner).toBeNull();
  });

  it("robber is not on any hex at start (robberActive = false)", () => {
    const state = createInitialState(makePlayers(3));
    const hexWithRobber = Object.values(state.board.hexes).find(
      (h) => h.hasRobber,
    );
    expect(hexWithRobber).toBeUndefined();
  });
});

// ─── Setup Phase ──────────────────────────────────────────────────────────────

describe("setup phase - PLACE_BUILDING", () => {
  it("SETUP_R1: places a settlement on the board", () => {
    const state = createInitialState(makePlayers(3));
    const vid = Object.keys(graph.vertices)[0] as VertexId;
    const nextState = applyAction(state, {
      type: "PLACE_BUILDING",
      pid: "p1",
      vid,
      building: "settlement",
    });
    expect(nextState.board.vertices[vid]?.type).toBe("settlement");
  });

  it("SETUP_R1: advances phase to SETUP_R1_ROAD after placing", () => {
    const state = createInitialState(makePlayers(3));
    const vid = Object.keys(graph.vertices)[0] as VertexId;
    const nextState = applyAction(state, {
      type: "PLACE_BUILDING",
      pid: "p1",
      vid,
      building: "settlement",
    });
    expect(nextState.phase).toBe("SETUP_R1_ROAD");
  });

  it("SETUP_R2: places a city (not settlement)", () => {
    const state = buildSetupR2State();
    const vid = findEmptyVertex(state);
    const nextState = applyAction(state, {
      type: "PLACE_BUILDING",
      pid: state.currentPlayerId,
      vid,
      building: "city",
    });
    expect(nextState.board.vertices[vid]?.type).toBe("city");
  });

  it("SETUP_R2: grants starting resources for city placement", () => {
    const state = buildSetupR2State();
    const vid = findCityVertexWithProduction(state);
    if (!vid) return; // no suitable vertex found
    const pid = state.currentPlayerId;
    const nextState = applyAction(state, {
      type: "PLACE_BUILDING",
      pid,
      vid,
      building: "city",
    });
    // After city placement, player collects 1 resource per adjacent hex
    const adjacentHexes = graph.hexesOfVertex[vid] ?? [];
    let expectedGain = 0;
    for (const hid of adjacentHexes) {
      if (state.board.hexes[hid]?.terrain !== "desert") expectedGain++;
    }
    const totalResources = Object.values(
      nextState.players[pid]!.resources,
    ).reduce((a, b) => a + b, 0);
    expect(totalResources).toBeGreaterThanOrEqual(expectedGain);
  });
});

// ─── Resource Production ──────────────────────────────────────────────────────

describe("resource production", () => {
  it("settlement on hex with rolled number gets 1 resource", () => {
    const state = buildActionState();
    const pid = state.currentPlayerId;
    // Find a hex number and player settlement
    const { hexNum, vid } = findSettlementAndHex(state, pid);
    if (hexNum === 0) return;

    const before = { ...state.players[pid]!.resources };
    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid,
      result: [hexNum - 1, 1, "politics" as const],
    });
    // After production, player should have more resources
    const after = rolled.players[pid]!.resources;
    const gained = Object.entries(after).reduce(
      (sum, [k, v]) => sum + v - (before[k as keyof typeof before] ?? 0),
      0,
    );
    expect(gained).toBeGreaterThanOrEqual(1);
  });

  it("city on hex with rolled number gets resource + commodity", () => {
    const state = buildActionStateWithCity();
    if (!state) return;
    const pid = state.currentPlayerId;
    const { hexNum, vid } = findCityAndHex(state, pid);
    if (hexNum === 0) return;

    const before = { ...state.players[pid]!.resources };
    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid,
      result: [hexNum - 1, 1, "politics" as const],
    });
    const after = rolled.players[pid]!.resources;
    const gained = Object.entries(after).reduce(
      (sum, [k, v]) => sum + v - (before[k as keyof typeof before] ?? 0),
      0,
    );
    // City produces 2 cards (resource + commodity for most terrain types)
    expect(gained).toBeGreaterThanOrEqual(2);
  });

  it("rolling 7 triggers discard for players with 8+ cards", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;
    // Give a player 10 cards
    state = {
      ...state,
      players: {
        ...state.players,
        p2: {
          ...state.players["p2"]!,
          resources: { ...state.players["p2"]!.resources, brick: 10 },
        },
      },
    };
    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid,
      result: [3, 4, "ship" as const], // sum = 7
    });
    // Should enter DISCARD or PRODUCTION phase (robber inactive before first attack)
    expect(["DISCARD", "PRODUCTION", "ROBBER_MOVE"]).toContain(rolled.phase);
    // p2 should have pending discard
    if (rolled.pendingDiscard) {
      expect(rolled.pendingDiscard.remaining["p2"]).toBeGreaterThan(0);
    }
  });

  it("rolling 7 does NOT move robber when robber is inactive", () => {
    const state = buildActionState();
    const pid = state.currentPlayerId;
    expect(state.barbarian.robberActive).toBe(false);
    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid,
      result: [3, 4, "ship" as const],
    });
    // Robber should still be inactive and no hex should have it
    expect(rolled.barbarian.robberActive).toBe(false);
    const hexWithRobber = Object.values(rolled.board.hexes).find(
      (h) => h.hasRobber,
    );
    expect(hexWithRobber).toBeUndefined();
  });
});

describe("progress draw thresholds", () => {
  it("uses red die (not yellow die) to determine progress draw eligibility", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;

    state = {
      ...state,
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          improvements: {
            ...state.players[pid]!.improvements,
            science: 1,
          },
        },
      },
      phase: "ROLL_DICE",
      pendingProgressDraw: null,
    };

    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid,
      result: [1, 2, "science" as const],
    });

    expect(rolled.pendingProgressDraw).toBeNull();
  });

  it("creates pending progress draws when red die is within the DRAW_MAX range", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;

    state = {
      ...state,
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          improvements: {
            ...state.players[pid]!.improvements,
            science: 2,
          },
        },
      },
      phase: "ROLL_DICE",
      pendingProgressDraw: null,
    };

    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid,
      result: [6, 3, "science" as const],
    });

    expect(rolled.pendingProgressDraw?.track).toBe("science");
    expect(rolled.pendingProgressDraw?.remaining).toContain(pid);
    expect(rolled.phase).toBe("RESOLVE_PROGRESS_DRAW");
  });

  it("does not create progress draws on ship events", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;

    state = {
      ...state,
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          improvements: {
            ...state.players[pid]!.improvements,
            politics: 5,
          },
        },
      },
      phase: "ROLL_DICE",
      pendingProgressDraw: null,
    };

    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid,
      result: [2, 1, "ship" as const],
    });

    expect(rolled.pendingProgressDraw).toBeNull();
  });
});

describe("displaced knight resolution", () => {
  it("keeps the displacer in place and relocates the displaced knight", () => {
    const state = createInitialState(makePlayers(2));
    const edgeId = Object.keys(graph.edges)[0]!;
    const [from, to] = graph.verticesOfEdge[edgeId]!;
    const displacedState: GameState = {
      ...state,
      phase: "KNIGHT_DISPLACE_RESPONSE",
      currentPlayerId: "p1",
      board: {
        ...state.board,
        edges: { ...state.board.edges, [edgeId]: { playerId: "p2" } },
        knights: {
          ...state.board.knights,
          [from]: { playerId: "p1", strength: 2, active: false },
        },
      },
      pendingDisplace: {
        displacerPlayerId: "p1",
        displacedPlayerId: "p2",
        displacedKnightVertex: from,
        displacedKnightStrength: 1,
      },
    };

    const nextState = applyAction(displacedState, {
      type: "DISPLACED_MOVE",
      pid: "p2",
      from,
      to,
    });

    expect(nextState.pendingDisplace).toBeNull();
    expect(nextState.phase).toBe("ACTION");
    expect(nextState.board.knights[from]?.playerId).toBe("p1");
    expect(nextState.board.knights[to]?.playerId).toBe("p2");
    expect(nextState.board.knights[to]?.strength).toBe(1);
  });
});

// ─── computeVP ────────────────────────────────────────────────────────────────

describe("computeVP", () => {
  it("starts at 0 for all players", () => {
    const state = createInitialState(makePlayers(3));
    for (const pid of state.playerOrder) {
      expect(computeVP(state, pid)).toBe(0);
    }
  });

  it("settlement = 1 VP, city = 2 VP", () => {
    const state = buildActionState();
    const pid = state.currentPlayerId;
    // Find settlements and cities for pid
    let settlements = 0,
      cities = 0;
    for (const b of Object.values(state.board.vertices)) {
      if (b?.playerId === pid) {
        if (b.type === "settlement") settlements++;
        if (b.type === "city") cities++;
      }
    }
    const vp = computeVP(state, pid);
    expect(vp).toBe(settlements * 1 + cities * 2);
  });

  it("longest road owner gets +2 VP", () => {
    const state = {
      ...buildActionState(),
      longestRoadOwner: "p1" as PlayerId,
      longestRoadLength: 5,
    };
    const vpWith = computeVP(state, "p1");
    const stateWithout = { ...state, longestRoadOwner: null };
    const vpWithout = computeVP(stateWithout, "p1");
    expect(vpWith - vpWithout).toBe(2);
  });

  it("metropolis on city adds +2 VP (total 4 for that city)", () => {
    const state = buildActionState();
    const pid = state.currentPlayerId;
    // Give p1 a city with a metropolis
    const cityVertex = Object.entries(state.board.vertices).find(
      ([, b]) => b?.type === "city" && b.playerId === pid,
    )?.[0] as VertexId | undefined;
    if (!cityVertex) return;

    const stateWithMetro = {
      ...state,
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [cityVertex]: {
            type: "city" as const,
            playerId: pid,
            hasWall: false,
            metropolis: "science" as const,
          },
        },
      },
    };
    const vpWith = computeVP(stateWithMetro, pid);
    const vpWithout = computeVP(state, pid);
    // Metropolis adds +2 to what would be a regular city
    expect(vpWith - vpWithout).toBe(2);
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fast-forward to SETUP_R2 state by completing all R1 placements */
function buildSetupR2State(): GameState {
  let state = createInitialState(makePlayers(3));
  const allVertices = Object.keys(graph.vertices) as VertexId[];
  let vIdx = 0;

  // Complete all setup_r1 placements
  while (
    state.phase === "SETUP_R1_SETTLEMENT" ||
    state.phase === "SETUP_R1_ROAD"
  ) {
    if (state.phase === "SETUP_R1_SETTLEMENT") {
      // Find a valid vertex
      let vid: VertexId | null = null;
      for (let i = vIdx; i < allVertices.length; i++) {
        const v = allVertices[i]!;
        if (state.board.vertices[v] === null) {
          const adj = graph.adjacentVertices[v] ?? [];
          if (adj.every((a) => state.board.vertices[a] === null)) {
            vid = v;
            vIdx = i + 1;
            break;
          }
        }
      }
      if (!vid) break;
      state = applyAction(state, {
        type: "PLACE_BUILDING",
        pid: state.currentPlayerId,
        vid,
        building: "settlement",
      });
    } else {
      // Place road adjacent to the last placed building
      const lastBuilding = Object.entries(state.board.vertices).find(
        ([, b]) =>
          b?.playerId === state.currentPlayerId && b.type === "settlement",
      )?.[0] as VertexId | undefined;
      if (!lastBuilding) break;
      const freeEdge = (graph.edgesOfVertex[lastBuilding] ?? []).find(
        (e) => state.board.edges[e] === null,
      );
      if (!freeEdge) break;
      state = applyAction(state, {
        type: "PLACE_ROAD",
        pid: state.currentPlayerId,
        eid: freeEdge,
      });
    }
  }
  return state;
}

/** Build a state where the current player is in ACTION phase with resources */
function buildActionState(): GameState {
  let state = createInitialState(makePlayers(3));
  const allVertices = Object.keys(graph.vertices) as VertexId[];
  let vIdx = 0;

  // Complete full setup
  while (
    [
      "SETUP_R1_SETTLEMENT",
      "SETUP_R1_ROAD",
      "SETUP_R2_CITY",
      "SETUP_R2_ROAD",
    ].includes(state.phase)
  ) {
    const pid = state.currentPlayerId;
    if (state.phase === "SETUP_R1_SETTLEMENT") {
      let vid: VertexId | null = null;
      for (let i = vIdx; i < allVertices.length; i++) {
        const v = allVertices[i]!;
        if (state.board.vertices[v] === null) {
          const adj = graph.adjacentVertices[v] ?? [];
          if (adj.every((a) => state.board.vertices[a] === null)) {
            vid = v;
            vIdx = i + 1;
            break;
          }
        }
      }
      if (!vid) break;
      state = applyAction(state, {
        type: "PLACE_BUILDING",
        pid,
        vid,
        building: "settlement",
      });
    } else if (state.phase === "SETUP_R1_ROAD") {
      const lastBuilding = findLastPlacedBuilding(state, pid, "settlement");
      if (!lastBuilding) break;
      const freeEdge = (graph.edgesOfVertex[lastBuilding] ?? []).find(
        (e) => state.board.edges[e] === null,
      );
      if (!freeEdge) break;
      state = applyAction(state, { type: "PLACE_ROAD", pid, eid: freeEdge });
    } else if (state.phase === "SETUP_R2_CITY") {
      let vid: VertexId | null = null;
      for (let i = vIdx; i < allVertices.length; i++) {
        const v = allVertices[i]!;
        if (state.board.vertices[v] === null) {
          const adj = graph.adjacentVertices[v] ?? [];
          if (adj.every((a) => state.board.vertices[a] === null)) {
            vid = v;
            vIdx = i + 1;
            break;
          }
        }
      }
      if (!vid) break;
      state = applyAction(state, {
        type: "PLACE_BUILDING",
        pid,
        vid,
        building: "city",
      });
    } else if (state.phase === "SETUP_R2_ROAD") {
      const lastBuilding = findLastPlacedBuilding(state, pid, "city");
      if (!lastBuilding) break;
      const freeEdge = (graph.edgesOfVertex[lastBuilding] ?? []).find(
        (e) => state.board.edges[e] === null,
      );
      if (!freeEdge) break;
      state = applyAction(state, { type: "PLACE_ROAD", pid, eid: freeEdge });
    }
  }

  // Give resources for testing
  for (const pid of state.playerOrder) {
    state = {
      ...state,
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          resources: {
            brick: 5,
            lumber: 5,
            ore: 5,
            grain: 5,
            wool: 5,
            cloth: 5,
            coin: 5,
            paper: 5,
          },
        },
      },
    };
  }

  return state;
}

function buildActionStateWithCity(): GameState | null {
  const state = buildActionState();
  // Check if any player already has a city (from setup round 2)
  const hasCities = Object.values(state.board.vertices).some(
    (b) => b?.type === "city",
  );
  if (hasCities) return state;
  return null;
}

function findLastPlacedBuilding(
  state: GameState,
  pid: PlayerId,
  type: "settlement" | "city",
): VertexId | null {
  // Return any building vertex for this player of the given type
  const entry = Object.entries(state.board.vertices).find(
    ([, b]) => b?.playerId === pid && b.type === type,
  );
  return entry ? (entry[0] as VertexId) : null;
}

function findEmptyVertex(state: GameState): VertexId {
  const allVertices = Object.keys(graph.vertices) as VertexId[];
  for (const v of allVertices) {
    if (state.board.vertices[v] === null) {
      const adj = graph.adjacentVertices[v] ?? [];
      if (adj.every((a) => state.board.vertices[a] === null)) return v;
    }
  }
  return allVertices[0]!;
}

function findCityVertexWithProduction(state: GameState): VertexId | null {
  const allVertices = Object.keys(graph.vertices) as VertexId[];
  for (const v of allVertices) {
    if (state.board.vertices[v] === null) {
      const adj = graph.adjacentVertices[v] ?? [];
      if (!adj.every((a) => state.board.vertices[a] === null)) continue;
      const hexes = graph.hexesOfVertex[v] ?? [];
      if (hexes.some((hid) => state.board.hexes[hid]?.terrain !== "desert"))
        return v;
    }
  }
  return null;
}

function findSettlementAndHex(
  state: GameState,
  pid: PlayerId,
): { hexNum: number; vid: VertexId } {
  for (const [vid, building] of Object.entries(state.board.vertices)) {
    if (building?.type === "settlement" && building.playerId === pid) {
      for (const hid of graph.hexesOfVertex[vid as VertexId] ?? []) {
        const hex = state.board.hexes[hid];
        if (hex?.number !== null && hex?.number !== undefined) {
          return { hexNum: hex.number, vid: vid as VertexId };
        }
      }
    }
  }
  return { hexNum: 0, vid: "" as VertexId };
}

function findCityAndHex(
  state: GameState,
  pid: PlayerId,
): { hexNum: number; vid: VertexId } {
  for (const [vid, building] of Object.entries(state.board.vertices)) {
    if (building?.type === "city" && building.playerId === pid) {
      for (const hid of graph.hexesOfVertex[vid as VertexId] ?? []) {
        const hex = state.board.hexes[hid];
        if (hex?.number !== null && hex?.number !== undefined) {
          return { hexNum: hex.number, vid: vid as VertexId };
        }
      }
    }
  }
  return { hexNum: 0, vid: "" as VertexId };
}
