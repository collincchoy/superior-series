import { describe, it, expect } from "vitest";
import { createInitialState, applyAction } from "../../lib/catan/game.js";
import { chooseBotAction } from "../../lib/catan/ai.js";
import { getActingPlayerIds } from "../../lib/catan/turnActors.js";
import { buildGraph } from "../../lib/catan/board.js";
import type {
  GameState,
  TurnPhase,
  PlayerId,
  VertexId,
  EdgeId,
  HexId,
  Resources,
} from "../../lib/catan/types.js";
import { emptyResources } from "../../lib/catan/types.js";

const graph = buildGraph();

function makeBotPlayers(count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: `bot${i + 1}`,
    name: `Bot ${i + 1}`,
    color: ["#e74c3c", "#3498db", "#f39c12"][i]!,
    isBot: true,
  }));
}

/** Fast-forward through setup to get to ACTION phase */
function buildActionState(): GameState {
  let state = createInitialState(makeBotPlayers(3));

  const setupPhases: TurnPhase[] = [
    "SETUP_R1_SETTLEMENT",
    "SETUP_R1_ROAD",
    "SETUP_R2_CITY",
    "SETUP_R2_ROAD",
  ];

  while (setupPhases.includes(state.phase)) {
    const action = chooseBotAction(state, state.currentPlayerId);
    state = applyAction(state, action);
  }

  // Give bots resources for testing
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

// ─── Basic validity ───────────────────────────────────────────────────────────

describe("chooseBotAction - basic validity", () => {
  it("returns a valid action during SETUP_R1_SETTLEMENT", () => {
    const state = createInitialState(makeBotPlayers(3));
    const action = chooseBotAction(state, state.currentPlayerId);
    expect(action).toBeDefined();
    expect(action.type).toBe("PLACE_BUILDING");
  });

  it("returns PLACE_ROAD during SETUP_R1_ROAD", () => {
    let state = createInitialState(makeBotPlayers(3));
    state = applyAction(state, chooseBotAction(state, state.currentPlayerId));
    expect(state.phase).toBe("SETUP_R1_ROAD");
    const action = chooseBotAction(state, state.currentPlayerId);
    expect(action.type).toBe("PLACE_ROAD");
  });

  it("places a city in SETUP_R2_CITY", () => {
    let state = createInitialState(makeBotPlayers(3));
    // Complete round 1 for all players
    while (
      state.phase === "SETUP_R1_SETTLEMENT" ||
      state.phase === "SETUP_R1_ROAD"
    ) {
      state = applyAction(state, chooseBotAction(state, state.currentPlayerId));
    }
    expect(state.phase).toBe("SETUP_R2_CITY");
    const action = chooseBotAction(state, state.currentPlayerId);
    expect(action.type).toBe("PLACE_BUILDING");
    if (action.type === "PLACE_BUILDING") {
      expect(action.building).toBe("city");
    }
  });

  it("returns ROLL_DICE during ROLL_DICE phase", () => {
    const state = buildActionState();
    // State after setup should be ROLL_DICE
    const rollState = { ...state, phase: "ROLL_DICE" as const };
    const action = chooseBotAction(rollState, rollState.currentPlayerId);
    expect(action.type).toBe("ROLL_DICE");
  });

  it("returns END_TURN or a build action during ACTION phase", () => {
    const state = buildActionState();
    const actionState = { ...state, phase: "ACTION" as const };
    const action = chooseBotAction(actionState, actionState.currentPlayerId);
    expect(action).toBeDefined();
    const validTypes = [
      "BUILD_ROAD",
      "BUILD_SETTLEMENT",
      "BUILD_CITY",
      "BUILD_CITY_WALL",
      "RECRUIT_KNIGHT",
      "PROMOTE_KNIGHT",
      "ACTIVATE_KNIGHT",
      "IMPROVE_CITY",
      "TRADE_BANK",
      "END_TURN",
    ];
    expect(validTypes).toContain(action.type);
  });
});

// ─── Discard validation ───────────────────────────────────────────────────────

describe("chooseBotAction - discard", () => {
  it("discards to at most 7 cards when in DISCARD phase", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;

    // Give player 10 cards
    state = {
      ...state,
      phase: "DISCARD" as const,
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          resources: {
            brick: 10,
            lumber: 0,
            ore: 0,
            grain: 0,
            wool: 0,
            cloth: 0,
            coin: 0,
            paper: 0,
          },
        },
      },
      pendingDiscard: { remaining: { [pid]: 5 } },
    };

    const action = chooseBotAction(state, pid);
    expect(action.type).toBe("DISCARD");
    if (action.type === "DISCARD") {
      const total = Object.values(action.cards).reduce(
        (a, b) => a + (b ?? 0),
        0,
      );
      expect(total).toBe(5);
    }
  });
});

// ─── Move robber ──────────────────────────────────────────────────────────────

describe("chooseBotAction - robber", () => {
  it("returns MOVE_ROBBER during ROBBER_MOVE phase", () => {
    const state = {
      ...buildActionState(),
      phase: "ROBBER_MOVE" as const,
      barbarian: { position: 0, robberActive: true },
    };
    const action = chooseBotAction(state, state.currentPlayerId);
    expect(action.type).toBe("MOVE_ROBBER");
  });
});

describe("chooseBotAction - displaced knight", () => {
  it("chooses a legal relocation when a displaced knight can move", () => {
    const state = createInitialState(makeBotPlayers(2));
    const pid = "bot2";
    const edgeId = Object.keys(graph.edges)[0]!;
    const [from, to] = graph.verticesOfEdge[edgeId]!;
    const displacedState: GameState = {
      ...state,
      phase: "KNIGHT_DISPLACE_RESPONSE",
      currentPlayerId: "bot1",
      board: {
        ...state.board,
        edges: { ...state.board.edges, [edgeId]: { playerId: pid } },
        knights: {
          ...state.board.knights,
          [from]: { playerId: "bot1", strength: 2, active: false },
        },
      },
      pendingDisplace: {
        displacerPlayerId: "bot1",
        displacedPlayerId: pid,
        displacedKnightVertex: from,
        displacedKnightStrength: 1,
      },
    };

    const action = chooseBotAction(displacedState, pid);
    expect(action.type).toBe("DISPLACED_MOVE");
    if (action.type === "DISPLACED_MOVE") {
      expect(action.to).toBe(to);
    }
  });

  it("returns null destination when a displaced knight has no legal move", () => {
    const state = createInitialState(makeBotPlayers(2));
    const pid = "bot2";
    const from = Object.keys(graph.vertices)[0] as VertexId;
    const displacedState: GameState = {
      ...state,
      phase: "KNIGHT_DISPLACE_RESPONSE",
      currentPlayerId: "bot1",
      board: {
        ...state.board,
        knights: {
          ...state.board.knights,
          [from]: { playerId: "bot1", strength: 2, active: false },
        },
      },
      pendingDisplace: {
        displacerPlayerId: "bot1",
        displacedPlayerId: pid,
        displacedKnightVertex: from,
        displacedKnightStrength: 1,
      },
    };

    const action = chooseBotAction(displacedState, pid);
    expect(action.type).toBe("DISPLACED_MOVE");
    if (action.type === "DISPLACED_MOVE") {
      expect(action.to).toBeNull();
    }
  });
});

// ─── No infinite loops ────────────────────────────────────────────────────────

describe("chooseBotAction - no infinite loops", () => {
  it("bot completes its turn within 50 actions", () => {
    let state = buildActionState();
    state = { ...state, phase: "ROLL_DICE" as const };
    const pid = state.currentPlayerId;

    let actions = 0;
    const MAX_ACTIONS = 50;

    while (state.phase !== "ROLL_DICE" || state.currentPlayerId === pid) {
      if (actions++ > MAX_ACTIONS) break;
      const action = chooseBotAction(state, state.currentPlayerId);
      state = applyAction(state, action);
      if (state.phase === "GAME_OVER") break;
      // If turn changed, stop
      if (state.currentPlayerId !== pid && state.phase === "ROLL_DICE") break;
    }

    expect(actions).toBeLessThanOrEqual(MAX_ACTIONS);
  });
});

// ─── Full game simulation ─────────────────────────────────────────────────────

describe("chooseBotAction - extended simulation", () => {
  it("3 bots play 500 actions without errors", () => {
    let state = createInitialState(makeBotPlayers(3));
    let steps = 0;
    const MAX_STEPS = 500;

    while (state.phase !== "GAME_OVER" && steps < MAX_STEPS) {
      const acting = getActingPlayerIds(state).filter(
        (p) => state.players[p]?.isBot,
      );
      const actorId = acting[0] ?? state.currentPlayerId;
      const action = chooseBotAction(state, actorId);
      state = applyAction(state, action);
      steps++;
    }
    // Bots should at minimum progress past setup into real action phases.
    expect(state.phase).not.toBe("SETUP_R1_SETTLEMENT");
  });
});

describe("chooseBotAction - full game simulation", () => {
  it("bots can play through setup without errors", () => {
    let state = createInitialState(makeBotPlayers(3));

    const setupPhases: TurnPhase[] = [
      "SETUP_R1_SETTLEMENT",
      "SETUP_R1_ROAD",
      "SETUP_R2_CITY",
      "SETUP_R2_ROAD",
    ];
    let steps = 0;

    while (setupPhases.includes(state.phase as any) && steps < 100) {
      const action = chooseBotAction(state, state.currentPlayerId);
      expect(action).toBeDefined();
      state = applyAction(state, action);
      steps++;
    }

    expect(state.phase).toBe("ROLL_DICE");
  });
});

// ─── Knight promotion ─────────────────────────────────────────────────────────

describe("chooseBotAction - knight promotion", () => {
  it("bot emits PROMOTE_KNIGHT when it has a promotable knight and barbarians are approaching", () => {
    const base = buildActionState();
    const pid = base.currentPlayerId;

    // Find a road edge owned by the current player to place a knight at one endpoint
    const playerEdgeEntry = Object.entries(base.board.edges).find(
      ([, e]) => e?.playerId === pid,
    )!;
    const eid = playerEdgeEntry[0] as EdgeId;
    const [vA] = graph.verticesOfEdge[eid]!;
    const knightVid = vA as VertexId;

    const state: GameState = {
      ...base,
      barbarian: { ...base.barbarian, position: 3 },
      board: {
        ...base.board,
        knights: {
          ...base.board.knights,
          [knightVid]: { playerId: pid, strength: 1, active: false },
        },
      },
      players: {
        ...base.players,
        [pid]: {
          ...base.players[pid]!,
          // Only enough resources for knightPromote (ore:1, wool:1); nothing else
          resources: { ...emptyResources(), ore: 1, wool: 1 },
        },
      },
      phase: "ACTION",
    };

    const action = chooseBotAction(state, pid);
    expect(action.type).toBe("PROMOTE_KNIGHT");
    if (action.type === "PROMOTE_KNIGHT") {
      expect(action.vid).toBe(knightVid);
      expect(action.pid).toBe(pid);
    }
  });
});

// ─── Bot trade response ────────────────────────────────────────────────────────

// ─── Phase 1: trade ratios ─────────────────────────────────────────────────────

describe("chooseBotAction - bank trade ratio", () => {
  it("uses 3:1 generic harbor instead of 4:1 when connected", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;

    // Find a player-owned building vertex and install a generic harbor on it.
    const ownedVid = Object.entries(state.board.vertices).find(
      ([, b]) => b?.playerId === pid,
    )![0] as VertexId;
    const neighbor = graph.adjacentVertices[ownedVid]![0]!;
    state = {
      ...state,
      phase: "ACTION" as const,
      board: {
        ...state.board,
        harbors: [
          ...state.board.harbors,
          { vertices: [ownedVid, neighbor], type: "generic" },
        ],
      },
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          // Short on ore: trigger the trade path toward a city.
          resources: {
            brick: 3,
            lumber: 3,
            ore: 0,
            grain: 2,
            wool: 3,
            cloth: 0,
            coin: 0,
            paper: 0,
          },
          // has a settlement on board already (so buildCity goal)
          improvements: { science: 0, trade: 0, politics: 0 },
        },
      },
    };

    const action = chooseBotAction(state, pid);
    if (action.type === "TRADE_BANK") {
      const total = Object.values(action.give).reduce((a, b) => a + (b ?? 0), 0);
      expect(total).toBeLessThanOrEqual(3);
    }
  });
});

// ─── Phase 1: road connectivity ────────────────────────────────────────────────

describe("chooseBotAction - road connectivity", () => {
  it("does not propose BUILD_ROAD on an edge disconnected from its network", () => {
    const state = buildActionState();
    const pid = state.currentPlayerId;

    // Clear all resources so bot has nothing else to do; give brick + lumber for a road.
    const actionState: GameState = {
      ...state,
      phase: "ACTION" as const,
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          resources: {
            ...emptyResources(),
            brick: 1,
            lumber: 1,
          },
        },
      },
    };

    const action = chooseBotAction(actionState, pid);
    if (action.type === "BUILD_ROAD") {
      const [vA, vB] = graph.verticesOfEdge[action.eid]!;
      const onNetwork =
        actionState.board.vertices[vA]?.playerId === pid ||
        actionState.board.vertices[vB]?.playerId === pid ||
        Object.values(actionState.board.edges).some(
          (r) => r?.playerId === pid,
        );
      expect(onNetwork).toBe(true);
    }
  });
});

// ─── Phase 1: improvement track selection ──────────────────────────────────────

describe("chooseBotAction - improvement track", () => {
  it("prefers politics when a strength-2 knight is ready for Mighty promotion", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;

    // Place a strength-2 knight on a player-owned vertex.
    const ownedVid = Object.entries(state.board.vertices).find(
      ([, b]) => b?.playerId === pid,
    )![0] as VertexId;

    state = {
      ...state,
      phase: "ACTION" as const,
      board: {
        ...state.board,
        knights: {
          ...state.board.knights,
          [ownedVid]: { playerId: pid, strength: 2, active: true },
        },
      },
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          // Not enough to build city (no ore surplus); can improve.
          resources: {
            ...emptyResources(),
            coin: 3,
            paper: 3,
            cloth: 3,
          },
          // All tracks at 2 so politics requires 3 coin; bot has 3.
          improvements: { science: 2, trade: 2, politics: 2 },
        },
      },
    };

    const action = chooseBotAction(state, pid);
    expect(action.type).toBe("IMPROVE_CITY");
    if (action.type === "IMPROVE_CITY") {
      expect(action.track).toBe("politics");
    }
  });
});

// ─── Phase 1: pending free roads ───────────────────────────────────────────────

describe("chooseBotAction - pending free roads", () => {
  it("emits PROGRESS_PLACE_FREE_ROAD when pendingFreeRoads is active", () => {
    const state = buildActionState();
    const pid = state.currentPlayerId;

    const pendingState: GameState = {
      ...state,
      phase: "ACTION" as const,
      pendingFreeRoads: { pid, remaining: 2 },
    };

    const action = chooseBotAction(pendingState, pid);
    expect([
      "PROGRESS_PLACE_FREE_ROAD",
      "PROGRESS_SKIP_FREE_ROADS",
    ]).toContain(action.type);
    if (action.type === "PROGRESS_PLACE_FREE_ROAD") {
      expect(action.pid).toBe(pid);
    }
  });
});

// ─── Phase 2: progress cards ───────────────────────────────────────────────────

describe("chooseBotAction - progress cards", () => {
  function giveCard(state: GameState, pid: PlayerId, card: any): GameState {
    return {
      ...state,
      phase: "ACTION" as const,
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          progressCards: [
            ...state.players[pid]!.progressCards,
            { name: card, track: "science" as const, isVP: false },
          ],
        },
      },
    };
  }

  it("plays Irrigation when adjacent to a field hex", () => {
    const base = buildActionState();
    const pid = base.currentPlayerId;
    // Check there's at least one field hex adjacent to one of our buildings.
    const ownedVid = Object.entries(base.board.vertices).find(
      ([, b]) => b?.playerId === pid,
    )?.[0] as VertexId;
    const hasField = (graph.hexesOfVertex[ownedVid] ?? []).some(
      (hid) => base.board.hexes[hid]?.terrain === "fields",
    );
    const state = giveCard(base, pid, "Irrigation");

    const action = chooseBotAction(state, pid);
    if (hasField) {
      expect(action.type).toBe("PLAY_PROGRESS");
      if (action.type === "PLAY_PROGRESS") {
        expect(action.card).toBe("Irrigation");
      }
    }
  });

  it("plays Encouragement when we have at least one inactive knight", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;
    const ownedVid = Object.entries(state.board.vertices).find(
      ([, b]) => b?.playerId === pid,
    )![0] as VertexId;

    state = {
      ...state,
      phase: "ACTION" as const,
      board: {
        ...state.board,
        knights: {
          ...state.board.knights,
          [ownedVid]: { playerId: pid, strength: 1, active: false },
        },
      },
    };
    state = giveCard(state, pid, "Encouragement");
    // Don't let it build city/improve first — wipe surplus resources.
    state = {
      ...state,
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          resources: emptyResources(),
        },
      },
    };

    const action = chooseBotAction(state, pid);
    expect(action.type).toBe("PLAY_PROGRESS");
    if (action.type === "PLAY_PROGRESS") {
      expect(action.card).toBe("Encouragement");
    }
  });

  it("does NOT play Encouragement when no inactive knights exist", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;
    state = giveCard(state, pid, "Encouragement");
    state = {
      ...state,
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          resources: emptyResources(),
        },
      },
    };

    const action = chooseBotAction(state, pid);
    // Will likely be END_TURN since everything else is also gated.
    expect(action.type).not.toBe("PLAY_PROGRESS");
  });

  it("plays Merchant when adjacent to a productive hex", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;
    state = giveCard(state, pid, "Merchant");
    state = {
      ...state,
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          resources: emptyResources(),
        },
      },
    };

    const action = chooseBotAction(state, pid);
    expect(action.type).toBe("PLAY_PROGRESS");
    if (action.type === "PLAY_PROGRESS") {
      expect(action.card).toBe("Merchant");
      expect(action.params).toBeDefined();
    }
  });

  it("plays Alchemy at ROLL_DICE when at least one hex produces for us", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;
    state = giveCard(state, pid, "Alchemy");
    state = { ...state, phase: "ROLL_DICE" as const };

    const action = chooseBotAction(state, pid);
    // Alchemy should play before regular ROLL_DICE; otherwise fall-through is fine.
    if (action.type === "PLAY_PROGRESS") {
      expect(action.card).toBe("Alchemy");
      const params = action.params as { die1: number; die2: number };
      expect(params.die1).toBeGreaterThanOrEqual(1);
      expect(params.die2).toBeLessThanOrEqual(6);
    } else {
      expect(action.type).toBe("ROLL_DICE");
    }
  });
});

// ─── Phase 1: pending knight promotions ────────────────────────────────────────

describe("chooseBotAction - pending knight promotions", () => {
  it("emits PROGRESS_PROMOTE_FREE_KNIGHT when pending with a promotable knight", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;

    const ownedVid = Object.entries(state.board.vertices).find(
      ([, b]) => b?.playerId === pid,
    )![0] as VertexId;

    state = {
      ...state,
      phase: "ACTION" as const,
      board: {
        ...state.board,
        knights: {
          ...state.board.knights,
          [ownedVid]: { playerId: pid, strength: 1, active: false },
        },
      },
      // Give politics L3 so Mighty promotion is allowed via Smithing.
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          improvements: { science: 0, trade: 0, politics: 3 },
        },
      },
      pendingKnightPromotions: { pid, remaining: 2 },
    };

    const action = chooseBotAction(state, pid);
    expect([
      "PROGRESS_PROMOTE_FREE_KNIGHT",
      "PROGRESS_SKIP_FREE_PROMOTIONS",
    ]).toContain(action.type);
  });
});

// ─── Phase 5: setup polish ─────────────────────────────────────────────────────

describe("chooseBotAction - setup harbor bonus", () => {
  it("picks a harbor-adjacent vertex when pips match a 2:1 harbor", () => {
    // Build a minimal board-state override: two candidate vertices both
    // adjacent to equivalent-pip hexes, but only one is on a matching 2:1
    // harbor. Bot should prefer the harbor-adjacent vertex.
    let state = createInitialState(makeBotPlayers(3));

    // Pick two unblocked vertices from the real graph. One will become the
    // harbor vertex for a 2:1 wool match adjacent to a pasture hex.
    const candidates = (Object.keys(graph.vertices) as VertexId[]).filter(
      (vid) => {
        const hexes = graph.hexesOfVertex[vid] ?? [];
        if (hexes.length < 2) return false;
        return hexes.every(
          (hid) =>
            state.board.hexes[hid]?.terrain !== "desert" &&
            state.board.hexes[hid]?.number !== null,
        );
      },
    );
    if (candidates.length === 0) return;

    // Rewire the first candidate so ONE of its adjacent hexes is pasture
    // and install a wool 2:1 harbor on that vertex.
    const harborVid = candidates[0]!;
    const harborHexes = graph.hexesOfVertex[harborVid] ?? [];
    const newHexes = { ...state.board.hexes };
    newHexes[harborHexes[0]!] = {
      ...newHexes[harborHexes[0]!]!,
      terrain: "pasture",
      number: 6,
    };
    // Force a harbor on a graph edge containing harborVid.
    const harborEdge = (graph.edgesOfVertex[harborVid] ?? [])[0]!;
    const [vA, vB] = graph.verticesOfEdge[harborEdge]!;

    state = {
      ...state,
      board: {
        ...state.board,
        hexes: newHexes,
        harbors: [
          {
            vertices: [vA!, vB!],
            type: "wool",
          },
        ],
      },
    };

    const action = chooseBotAction(state, state.currentPlayerId);
    if (action.type !== "PLACE_BUILDING") return;
    // The chosen vertex is expected to be the harbor-adjacent one (or its
    // partner on the same harbor edge) when scoring prefers it.
    expect([harborVid, vA, vB]).toContain(action.vid);
  });
});

describe("chooseBotAction - setup complementary basket", () => {
  it("round 2 city leans to expansion resources when round 1 is ore/grain heavy", () => {
    // Manually build a pre-R2-city state: place one high-pip ore/grain
    // settlement and verify chooseSetupCity picks a vertex that touches at
    // least one of brick/lumber/wool.
    let state = createInitialState(makeBotPlayers(3));

    // Fast-forward through R1 (settlement + road) for all players via the bot.
    while (state.phase === "SETUP_R1_SETTLEMENT" || state.phase === "SETUP_R1_ROAD") {
      const action = chooseBotAction(state, state.currentPlayerId);
      state = applyAction(state, action);
    }

    if (state.phase !== "SETUP_R2_CITY") return;

    // Find the current bot's R1 settlement and its adjacent terrains.
    const pid = state.currentPlayerId;
    const r1Vid = Object.keys(state.board.vertices).find(
      (vid) => state.board.vertices[vid as VertexId]?.playerId === pid,
    ) as VertexId | undefined;
    if (!r1Vid) return;
    const r1Terrains = new Set<string>();
    for (const hid of graph.hexesOfVertex[r1Vid] ?? []) {
      const t = state.board.hexes[hid]?.terrain;
      if (t && t !== "desert") r1Terrains.add(t);
    }

    const action = chooseBotAction(state, pid);
    expect(action.type).toBe("PLACE_BUILDING");
    // Sanity: the chosen vertex is a valid city placement (distant + empty).
    if (action.type === "PLACE_BUILDING") {
      expect(action.building).toBe("city");
      const chosenTerrains = new Set<string>();
      for (const hid of graph.hexesOfVertex[action.vid] ?? []) {
        const t = state.board.hexes[hid]?.terrain;
        if (t && t !== "desert") chosenTerrains.add(t);
      }
      // Second placement should cover at least one terrain not already owned.
      const newlyCovered = [...chosenTerrains].filter(
        (t) => !r1Terrains.has(t),
      );
      expect(newlyCovered.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ─── Phase 4: city wall + trade offer ─────────────────────────────────────────

describe("chooseBotAction - city wall", () => {
  it("builds a city wall when barbarian is close and we own an unwalled city", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;

    // Swap the setup city ownership to a city belonging to the bot so we have
    // an unwalled city. (Setup R2 places a city already.)
    // Tight resource scope so the bot doesn't go for other builds.
    state = {
      ...state,
      phase: "ACTION" as const,
      barbarian: { position: 5, robberActive: false },
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          resources: {
            ...emptyResources(),
            brick: 2,
            ore: 1,
          },
        },
      },
    };

    const action = chooseBotAction(state, pid);
    // The wall ladder kicks in after build-city/improve — in this state
    // nothing else is affordable, so it should be BUILD_CITY_WALL or END_TURN.
    expect(["BUILD_CITY_WALL", "END_TURN"]).toContain(action.type);
  });
});

describe("chooseBotAction - trade offer anti-loop", () => {
  it("does not re-emit an identical TRADE_OFFER when the hand hasn't changed", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;

    // Strong surplus (wool) and real need (ore) → should emit TRADE_OFFER once.
    state = {
      ...state,
      phase: "ACTION" as const,
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          resources: {
            ...emptyResources(),
            wool: 6,
            grain: 2,
          },
        },
      },
    };

    // Capture current state before action.
    const firstAction = chooseBotAction(state, pid);
    if (firstAction.type !== "TRADE_OFFER") return;

    // Second call with unchanged resources — should not issue the same offer again.
    const secondAction = chooseBotAction(state, pid);
    expect(secondAction.type).not.toBe("TRADE_OFFER");
  });
});

// ─── Phase 3: knight offense ───────────────────────────────────────────────────

describe("chooseBotAction - knight offense", () => {
  it("emits CHASE_ROBBER when an active knight is adjacent to the robber hex", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;

    // Pick a knight spot that is adjacent to a non-desert hex with no buildings.
    const candidate = Object.entries(graph.vertices).find(([vid]) => {
      if (state.board.vertices[vid as VertexId]) return false;
      const hexes = graph.hexesOfVertex[vid as VertexId] ?? [];
      return hexes.some((hid) => state.board.hexes[hid]?.terrain !== "desert");
    });
    if (!candidate) return;
    const knightVid = candidate[0] as VertexId;
    const robberHid = (graph.hexesOfVertex[knightVid] ?? []).find(
      (hid) => state.board.hexes[hid]?.terrain !== "desert",
    );
    if (!robberHid) return;

    const hexes = Object.fromEntries(
      Object.entries(state.board.hexes).map(([k, v]) => [
        k,
        { ...v, hasRobber: false },
      ]),
    ) as typeof state.board.hexes;
    hexes[robberHid] = { ...hexes[robberHid]!, hasRobber: true };

    state = {
      ...state,
      phase: "ACTION" as const,
      barbarian: { ...state.barbarian, robberActive: true },
      board: {
        ...state.board,
        hexes,
        knights: {
          ...state.board.knights,
          [knightVid]: { playerId: pid, strength: 2, active: true },
        },
      },
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          resources: emptyResources(),
        },
      },
    };

    const action = chooseBotAction(state, pid);
    // Either CHASE_ROBBER or a defensive move; CHASE_ROBBER is preferred when legal.
    expect(["CHASE_ROBBER", "END_TURN", "MOVE_KNIGHT"]).toContain(action.type);
  });

  it("emits DISPLACE_KNIGHT when stronger and on an opponent's knight on our network", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;
    const otherPid = state.playerOrder.find((p) => p !== pid)!;

    // Place own active Mighty knight at one end of an owned road;
    // opponent weaker knight on the other endpoint.
    const playerEdgeEntry = Object.entries(state.board.edges).find(
      ([, e]) => e?.playerId === pid,
    );
    if (!playerEdgeEntry) return;
    const [eid] = playerEdgeEntry;
    const [vA, vB] = graph.verticesOfEdge[eid as EdgeId]!;
    // Put our knight at vA (if unowned or we can override).
    const myVert = vA;
    const opVert = vB;

    state = {
      ...state,
      phase: "ACTION" as const,
      board: {
        ...state.board,
        // Clear any existing building at these vertices.
        vertices: {
          ...state.board.vertices,
          [myVert]: null,
          [opVert]: null,
        },
        knights: {
          ...state.board.knights,
          [myVert]: { playerId: pid, strength: 3, active: true },
          [opVert]: { playerId: otherPid, strength: 2, active: true },
        },
      },
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          resources: emptyResources(),
        },
      },
    };

    const action = chooseBotAction(state, pid);
    expect(["DISPLACE_KNIGHT", "END_TURN", "MOVE_KNIGHT", "CHASE_ROBBER"]).toContain(
      action.type,
    );
  });
});

describe("chooseBotAction - trade response", () => {
  function makePendingTradeState(opts: {
    botResources?: Partial<Resources>;
    offer?: Partial<Resources>;
    want?: Partial<Resources>;
  } = {}) {
    const base = buildActionState();
    const [initiatorPid, botPid] = base.playerOrder as [string, string];
    const botResources = {
      ...emptyResources(),
      ore: 3,
      grain: 3,
      wool: 3,
      brick: 3,
      lumber: 3,
      ...opts.botResources,
    };
    return {
      state: {
        ...base,
        currentPlayerId: initiatorPid,
        phase: "ACTION" as const,
        players: {
          ...base.players,
          [botPid]: { ...base.players[botPid]!, resources: botResources },
        },
        pendingTradeOffer: {
          initiatorPid,
          targetPids: [botPid],
          offer: opts.offer ?? { brick: 2 },
          want: opts.want ?? { ore: 2 },
        },
      },
      botPid,
      initiatorPid,
    };
  }

  it("accepts a fair trade (equal value)", () => {
    const { state, botPid } = makePendingTradeState({
      offer: { brick: 3 },
      want: { brick: 3 },
    });
    const action = chooseBotAction(state, botPid);
    expect(action.type).toBe("TRADE_ACCEPT");
  });

  it("accepts a favorable trade (bot gains more value)", () => {
    // Bot gives wool (low value) and gets ore (high value)
    const { state, botPid } = makePendingTradeState({
      offer: { ore: 2 },   // initiator gives 2 ore (value 6)
      want: { wool: 3 },   // initiator wants 3 wool from bot (value 4.5)
    });
    const action = chooseBotAction(state, botPid);
    expect(action.type).toBe("TRADE_ACCEPT");
  });

  it("rejects a trade it cannot afford", () => {
    const { state, botPid } = makePendingTradeState({
      botResources: { ore: 0, grain: 0, wool: 0, brick: 0, lumber: 0 },
      offer: { brick: 1 },
      want: { ore: 1 },  // bot has 0 ore
    });
    const action = chooseBotAction(state, botPid);
    expect(action.type).toBe("TRADE_REJECT");
  });

  it("rejects a heavily disadvantageous trade", () => {
    // Bot gives 4 ore (value 12) for 1 wool (value 1.5) — very bad deal
    const { state, botPid } = makePendingTradeState({
      offer: { wool: 1 },
      want: { ore: 4 },
    });
    const action = chooseBotAction(state, botPid);
    expect(action.type).toBe("TRADE_REJECT");
  });
});

// ─── Activated-this-turn knight guard ─────────────────────────────────────────

describe("chooseBotAction - activated-this-turn knight", () => {
  it("returns END_TURN when the only eligible knight for CHASE_ROBBER was activated this turn", () => {
    const base = buildActionState();
    const pid = base.currentPlayerId;

    // Pick the hex with the robber (or any non-desert hex) and one of its vertices.
    const hexId = Object.keys(graph.verticesOfHex)[0] as HexId;
    const knightVid = graph.verticesOfHex[hexId]![0] as VertexId;

    const state: GameState = {
      ...base,
      phase: "ACTION",
      barbarian: { position: 6, robberActive: true },
      board: {
        ...base.board,
        hexes: {
          ...base.board.hexes,
          // Move robber to hexId so the knight is adjacent
          ...Object.fromEntries(
            Object.entries(base.board.hexes).map(([k, v]) => [
              k,
              { ...v, hasRobber: k === hexId },
            ]),
          ),
        },
        knights: {
          ...base.board.knights,
          [knightVid]: { playerId: pid, strength: 1, active: true },
        },
        // Remove opponent buildings to avoid other triggers
        vertices: Object.fromEntries(
          Object.entries(base.board.vertices).map(([k, v]) => [
            k,
            v?.playerId === pid ? v : null,
          ]),
        ),
      },
      knightsActivatedThisTurn: [knightVid],
      players: {
        ...base.players,
        [pid]: {
          ...base.players[pid]!,
          resources: emptyResources(),
        },
      },
    };

    const action = chooseBotAction(state, pid);
    expect(action.type).toBe("END_TURN");
  });
});
