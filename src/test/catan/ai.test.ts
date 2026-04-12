import { describe, it, expect } from "vitest";
import {
  createInitialState,
  applyAction,
  computeVP,
} from "../../lib/catan/game.js";
import { chooseBotAction } from "../../lib/catan/ai.js";
import { buildGraph } from "../../lib/catan/board.js";
import type {
  GameState,
  TurnPhase,
  PlayerId,
  VertexId,
  EdgeId,
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
  const allVertices = Object.keys(graph.vertices) as VertexId[];
  let vIdx = 0;

  const setupPhases: TurnPhase[] = [
    "SETUP_R1_SETTLEMENT",
    "SETUP_R1_ROAD",
    "SETUP_R2_CITY",
    "SETUP_R2_ROAD",
  ];

  while (setupPhases.includes(state.phase as any)) {
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
