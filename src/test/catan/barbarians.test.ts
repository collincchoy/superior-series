import { describe, it, expect } from "vitest";
import { createInitialState, applyAction } from "../../lib/catan/game.js";
import { buildGraph } from "../../lib/catan/board.js";
import { PROGRESS_CARD_BY_NAME } from "../../lib/catan/constants.js";
import type {
  GameState,
  PlayerId,
  ProgressCard,
  VertexId,
} from "../../lib/catan/types.js";

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

/**
 * Helper: roll the ship face that lands the barbarians, then immediately
 * commit the attack via EXECUTE_BARBARIAN_ATTACK. Mirrors the real flow
 * where the cinematic plays, then the host dispatches the commit.
 */
function rollShipAndCommit(state: GameState): GameState {
  const afterRoll = applyAction(state, {
    type: "ROLL_DICE",
    pid: state.currentPlayerId,
    result: [2, 3, "ship"],
  });
  // If the ship didn't land, no commit needed
  if (afterRoll.phase !== "RESOLVE_BARBARIANS") return afterRoll;
  return applyAction(afterRoll, {
    type: "EXECUTE_BARBARIAN_ATTACK",
    pid: afterRoll.currentPlayerId,
  });
}

// ─── Barbarian Track ──────────────────────────────────────────────────────────

describe("barbarian track", () => {
  it("advances on event die ship face", () => {
    const state = { ...stateWithBarbarian(2), phase: "ROLL_DICE" as const };
    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid: "p1",
      result: [2, 3, "ship"],
    });
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

  it("triggers attack at position 7 (after commit, resets to 0)", () => {
    const state = { ...stateWithBarbarian(6), phase: "ROLL_DICE" as const };
    const committed = rollShipAndCommit(state);
    expect(committed.barbarian.position).toBe(0);
  });

  it("does NOT trigger attack at position 6", () => {
    const state = { ...stateWithBarbarian(5), phase: "ROLL_DICE" as const };
    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid: "p1",
      result: [2, 3, "ship"],
    });
    expect(rolled.barbarian.position).toBe(6);
    expect(rolled.phase).not.toBe("RESOLVE_BARBARIANS");
  });
});

// ─── Deferred Attack Flow (new) ───────────────────────────────────────────────

describe("barbarian attack - deferred resolution flow", () => {
  it("ROLL_DICE landing the ship transitions to RESOLVE_BARBARIANS and populates pendingBarbarian", () => {
    let state = stateWithCities({ p1: 2 });
    state = addActiveKnights(state, "p1", 3, 1); // strength 3
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

    expect(rolled.phase).toBe("RESOLVE_BARBARIANS");
    expect(rolled.pendingBarbarian).not.toBeNull();
    expect(rolled.pendingBarbarian!.barbarianStrength).toBe(2);
    expect(rolled.pendingBarbarian!.totalDefense).toBe(3);
    expect(rolled.pendingBarbarian!.outcome).toBe("defenders_win");
    expect(rolled.pendingBarbarian!.vpWinners).toEqual(["p1"]);
    expect(rolled.pendingBarbarian!.tiedDefenders).toEqual([]);
    expect(rolled.pendingBarbarian!.citiesPillaged).toEqual([]);
  });

  it("ROLL_DICE landing with NO state mutation yet: cities/knights/VP unchanged", () => {
    let state = stateWithCities({ p1: 2 });
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

    // No VP granted yet (deferred to EXECUTE_BARBARIAN_ATTACK)
    expect(rolled.players["p1"]!.vpTokens).toBe(0);
    // Knights still active
    const anyActive = Object.values(rolled.board.knights).some(
      (k) => k && k.active,
    );
    expect(anyActive).toBe(true);
    // Cities unchanged (still 2 cities)
    const cityCount = Object.values(rolled.board.vertices).filter(
      (b) => b?.type === "city",
    ).length;
    expect(cityCount).toBe(2);
    // Ship parked at 7, not yet reset
    expect(rolled.barbarian.position).toBe(7);
  });

  it("pendingBarbarian classifies tie_draw when multiple defenders tie for top", () => {
    let state = stateWithCities({ p1: 1 });
    state = addActiveKnights(state, "p1", 2, 1); // p1: 2
    state = addActiveKnights(state, "p2", 2, 1); // p2: 2
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

    expect(rolled.pendingBarbarian!.outcome).toBe("tie_draw");
    expect(rolled.pendingBarbarian!.tiedDefenders.sort()).toEqual([
      "p1",
      "p2",
    ]);
    expect(rolled.pendingBarbarian!.vpWinners).toEqual([]);
  });

  it("pendingBarbarian classifies barbarians_win and lists cities to be pillaged", () => {
    // p1 has 2 cities, no knights → barbarians win, p1's city(s) at risk
    let state = stateWithCities({ p1: 2 });
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

    expect(rolled.pendingBarbarian!.outcome).toBe("barbarians_win");
    expect(rolled.pendingBarbarian!.citiesPillaged.length).toBeGreaterThan(0);
    // The pillage targets must reference actual city vertices owned by a lowest-tier player
    for (const vid of rolled.pendingBarbarian!.citiesPillaged) {
      const v = rolled.board.vertices[vid];
      expect(v?.type).toBe("city");
      expect(v?.type === "city" && v.metropolis).toBeNull();
    }
  });

  it("EXECUTE_BARBARIAN_ATTACK commits the defenders_win outcome (VP + knights inactive + track reset)", () => {
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
    const committed = applyAction(rolled, {
      type: "EXECUTE_BARBARIAN_ATTACK",
      pid: "p1",
    });

    expect(committed.phase).not.toBe("RESOLVE_BARBARIANS");
    expect(committed.pendingBarbarian).toBeNull();
    expect(committed.players["p1"]!.vpTokens).toBe(1);
    expect(committed.barbarian.position).toBe(0);
    expect(committed.barbarian.robberActive).toBe(true);
    for (const knight of Object.values(committed.board.knights)) {
      if (knight) expect(knight.active).toBe(false);
    }
  });

  it("EXECUTE_BARBARIAN_ATTACK commits the barbarians_win outcome (cities pillaged)", () => {
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
    const pillageTargets = [...rolled.pendingBarbarian!.citiesPillaged];
    expect(pillageTargets.length).toBeGreaterThan(0);

    const committed = applyAction(rolled, {
      type: "EXECUTE_BARBARIAN_ATTACK",
      pid: "p1",
    });

    for (const vid of pillageTargets) {
      expect(committed.board.vertices[vid]?.type).toBe("settlement");
    }
  });

  it("EXECUTE_BARBARIAN_ATTACK resumes production via pendingRollResume", () => {
    // No cities, no knights — attack resolves with 0 vs 0 (defenders_win, no VP).
    // The roll (5) must still produce resources afterward.
    let state = stateWithBarbarian(6);
    state = {
      ...state,
      phase: "ROLL_DICE" as const,
    };

    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid: "p1",
      result: [2, 3, "ship"],
    });
    expect(rolled.phase).toBe("RESOLVE_BARBARIANS");
    // pendingRollResume must be stashed so we can resume after commit
    expect(rolled.pendingRollResume).not.toBeNull();
    expect(rolled.pendingRollResume!.production).toBe(5);

    const committed = applyAction(rolled, {
      type: "EXECUTE_BARBARIAN_ATTACK",
      pid: "p1",
    });

    // After commit, rollResume is consumed and we're back on the normal path
    expect(committed.pendingRollResume).toBeNull();
    expect(committed.phase).not.toBe("RESOLVE_BARBARIANS");
  });

  it("EXECUTE_BARBARIAN_ATTACK enters DISCARD_PROGRESS when tie_draw draws past 4-card limit", () => {
    let state = stateWithCities({ p1: 1 });
    state = addActiveKnights(state, "p1", 2, 1);
    state = addActiveKnights(state, "p2", 2, 1);
    const fourHand: ProgressCard[] = [
      PROGRESS_CARD_BY_NAME.Alchemy,
      PROGRESS_CARD_BY_NAME.Crane,
      PROGRESS_CARD_BY_NAME.Engineering,
      PROGRESS_CARD_BY_NAME.Invention,
    ];
    state = {
      ...state,
      players: {
        ...state.players,
        p1: { ...state.players["p1"]!, progressCards: fourHand },
      },
      phase: "ROLL_DICE" as const,
      barbarian: { position: 6, robberActive: false },
    };

    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid: "p1",
      result: [2, 3, "ship"],
    });
    expect(rolled.pendingBarbarian!.outcome).toBe("tie_draw");

    const committed = applyAction(rolled, {
      type: "EXECUTE_BARBARIAN_ATTACK",
      pid: "p1",
    });
    expect(committed.phase).toBe("DISCARD_PROGRESS");
    expect(committed.pendingRollResume).not.toBeNull();
    expect(committed.pendingRollResume!.production).toBe(5);
    expect(committed.pendingProgressDiscard?.remaining["p1"]).toBeGreaterThan(0);
  });

  it("EXECUTE_BARBARIAN_ATTACK is a no-op if pendingBarbarian is null", () => {
    const state = stateWithBarbarian(0);
    const after = applyAction(state, {
      type: "EXECUTE_BARBARIAN_ATTACK",
      pid: "p1",
    });
    expect(after.phase).toBe(state.phase);
    expect(after.pendingBarbarian).toBeNull();
    expect(after.board).toBe(state.board);
    expect(after.players).toBe(state.players);
  });
});

// ─── Barbarian Attack: Defenders Win (end-to-end, through commit) ─────────────

describe("barbarian attack - defenders win", () => {
  it("defenders win: active knight strength >= city count (no cities pillaged)", () => {
    let state = stateWithCities({ p1: 2 });
    state = addActiveKnights(state, "p1", 2, 2);
    state = {
      ...state,
      phase: "ROLL_DICE" as const,
      barbarian: { position: 6, robberActive: false },
    };

    const committed = rollShipAndCommit(state);
    const cityCount = Object.values(committed.board.vertices).filter(
      (b) => b?.type === "city",
    ).length;
    expect(cityCount).toBe(2);
  });

  it("single defender winner gets 1 VP token", () => {
    let state = stateWithCities({ p1: 1 });
    state = addActiveKnights(state, "p1", 3, 1);
    state = {
      ...state,
      phase: "ROLL_DICE" as const,
      barbarian: { position: 6, robberActive: false },
    };

    const before = state.players["p1"]!.vpTokens;
    const committed = rollShipAndCommit(state);
    expect(committed.players["p1"]!.vpTokens).toBe(before + 1);
  });

  it("tied defenders each draw one progress card", () => {
    let state = stateWithCities({ p1: 1 });
    state = addActiveKnights(state, "p1", 2, 1);
    state = addActiveKnights(state, "p2", 2, 1);
    state = {
      ...state,
      phase: "ROLL_DICE" as const,
      barbarian: { position: 6, robberActive: false },
    };

    const p1Before = state.players["p1"]!.progressCards.length;
    const p2Before = state.players["p2"]!.progressCards.length;

    const committed = rollShipAndCommit(state);

    expect(committed.players["p1"]!.vpTokens).toBe(0);
    expect(committed.players["p2"]!.vpTokens).toBe(0);
    expect(committed.players["p1"]!.progressCards.length).toBe(p1Before + 1);
    expect(committed.players["p2"]!.progressCards.length).toBe(p2Before + 1);
  });

  it("all active knights become inactive after attack", () => {
    let state = stateWithCities({ p1: 1 });
    state = addActiveKnights(state, "p1", 2, 2);
    state = {
      ...state,
      phase: "ROLL_DICE" as const,
      barbarian: { position: 6, robberActive: false },
    };

    const committed = rollShipAndCommit(state);
    for (const knight of Object.values(committed.board.knights)) {
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

    const committed = rollShipAndCommit(state);
    expect(committed.barbarian.position).toBe(0);
  });
});

// ─── Barbarian Attack: Barbarians Win ─────────────────────────────────────────

describe("barbarian attack - barbarians win", () => {
  it("player with 0 knights loses a city", () => {
    let state = stateWithCities({ p1: 2 });
    state = {
      ...state,
      phase: "ROLL_DICE" as const,
      barbarian: { position: 6, robberActive: false },
    };

    const before = Object.values(state.board.vertices).filter(
      (b) => b?.type === "city",
    ).length;
    const committed = rollShipAndCommit(state);
    const after = Object.values(committed.board.vertices).filter(
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

    const committed = rollShipAndCommit(state);
    expect(committed.board.vertices[cityVertex]?.type).toBe("settlement");
  });

  it("metropolis city is NOT pillaged", () => {
    let state = stateWithCities({ p1: 1 });
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

    const committed = rollShipAndCommit(state);
    expect(committed.board.vertices[cityVertex]?.type).toBe("city");
  });

  it("logs when barbarians win but all cities are protected by metropolises", () => {
    let state = stateWithCities({ p1: 1, p2: 1 });
    const cities = Object.entries(state.board.vertices).filter(
      ([, b]) => b?.type === "city",
    ) as Array<[VertexId, NonNullable<GameState["board"]["vertices"][VertexId]>]>;
    expect(cities.length).toBe(2);

    state = {
      ...state,
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [cities[0]![0]]: {
            type: "city",
            playerId: "p1",
            hasWall: false,
            metropolis: "science",
          },
          [cities[1]![0]]: {
            type: "city",
            playerId: "p2",
            hasWall: false,
            metropolis: "trade",
          },
        },
      },
      phase: "ROLL_DICE" as const,
      barbarian: { position: 6, robberActive: false },
    };

    const committed = rollShipAndCommit(state);
    expect(
      Object.values(committed.board.vertices).filter((b) => b?.type === "city"),
    ).toHaveLength(2);
    expect(committed.log.at(-1)).toBe(
      "Barbarians won, but no cities were pillaged because all cities were protected by metropolises.",
    );
  });

  it("pillages the next lowest contributor when lower tiers have no eligible city", () => {
    let state = stateWithCities({ p1: 1, p2: 1 });
    const p1City = Object.entries(state.board.vertices).find(
      ([, b]) => b?.type === "city" && b.playerId === "p1",
    )?.[0] as VertexId | undefined;
    const p2City = Object.entries(state.board.vertices).find(
      ([, b]) => b?.type === "city" && b.playerId === "p2",
    )?.[0] as VertexId | undefined;
    if (!p1City || !p2City) return;

    state = addActiveKnights(state, "p2", 1, 1);
    state = {
      ...state,
      board: {
        ...state.board,
        vertices: {
          ...state.board.vertices,
          [p1City]: {
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
    expect(rolled.pendingBarbarian!.outcome).toBe("barbarians_win");
    expect(rolled.pendingBarbarian!.citiesPillaged).toEqual([p2City]);

    const committed = applyAction(rolled, {
      type: "EXECUTE_BARBARIAN_ATTACK",
      pid: "p1",
    });
    expect(committed.board.vertices[p1City]?.type).toBe("city");
    expect(committed.board.vertices[p2City]?.type).toBe("settlement");
  });

  it("city wall is removed when city is pillaged", () => {
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

    const committed = rollShipAndCommit(state);
    expect(committed.board.vertices[vid]?.type).toBe("settlement");
  });

  it("first barbarian attack activates the robber on the desert", () => {
    let state = stateWithCities({ p1: 1 });
    state = {
      ...state,
      phase: "ROLL_DICE" as const,
      barbarian: { position: 6, robberActive: false },
    };

    const committed = rollShipAndCommit(state);
    expect(committed.barbarian.robberActive).toBe(true);
    const desertHex = Object.values(committed.board.hexes).find(
      (h) => h.terrain === "desert",
    );
    if (desertHex) {
      expect(desertHex.hasRobber).toBe(true);
    }
  });
});
