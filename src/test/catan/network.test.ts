import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../../lib/catan/game.js";
import { buildGraph } from "../../lib/catan/board.js";
import { CatanNetwork } from "../../lib/catan/network.js";
import type { GameState } from "../../lib/catan/types.js";

const graph = buildGraph();

function makeStateWithPendingBotDiscard(): GameState {
  const state = createInitialState([
    { id: "p1", name: "Player 1", color: "#e74c3c", isBot: false },
    { id: "p2", name: "Bot 2", color: "#3498db", isBot: true },
  ]);

  return {
    ...state,
    phase: "DISCARD",
    currentPlayerId: "p1",
    players: {
      ...state.players,
      p2: {
        ...state.players["p2"]!,
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
    pendingDiscard: { remaining: { p2: 5 } },
  };
}

function makeStateWithPendingBotProgressDraw(): GameState {
  const state = createInitialState([
    { id: "p1", name: "Player 1", color: "#e74c3c", isBot: false },
    { id: "p2", name: "Bot 2", color: "#3498db", isBot: true },
  ]);

  return {
    ...state,
    phase: "RESOLVE_PROGRESS_DRAW",
    currentPlayerId: "p1",
    pendingProgressDraw: { remaining: ["p2"], track: "science" },
  };
}

function makeStateWithPendingBotDisplacedMove(): GameState {
  const state = createInitialState([
    { id: "p1", name: "Player 1", color: "#e74c3c", isBot: false },
    { id: "p2", name: "Bot 2", color: "#3498db", isBot: true },
  ]);
  const edgeId = Object.keys(graph.edges)[0]!;
  const [from, to] = graph.verticesOfEdge[edgeId]!;

  return {
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
}

describe("CatanNetwork bot sub-phase handling", () => {
  it("auto-resolves pending bot discards even when a human is the current player", () => {
    const onStateUpdate = vi.fn();
    const network = new CatanNetwork({
      onStateUpdate,
      onError: vi.fn(),
    });

    (network as any).state = makeStateWithPendingBotDiscard();

    (network as any).runBotTurns();

    const state = network.currentState!;
    expect(state.pendingDiscard).toBeNull();
    expect(state.phase).toBe("ACTION");
    expect(state.players["p2"]!.resources.brick).toBe(5);
    expect(onStateUpdate).toHaveBeenCalled();
  });

  it("auto-resolves pending bot progress draws even when a human is the current player", () => {
    const onStateUpdate = vi.fn();
    const network = new CatanNetwork({
      onStateUpdate,
      onError: vi.fn(),
    });

    (network as any).state = makeStateWithPendingBotProgressDraw();

    (network as any).runBotTurns();

    const state = network.currentState!;
    expect(state.pendingProgressDraw).toBeNull();
    expect(state.phase).toBe("ACTION");
    expect(state.players["p2"]!.progressCards).toHaveLength(1);
    expect(onStateUpdate).toHaveBeenCalled();
  });

  it("auto-resolves pending bot displaced moves even when a human is the current player", () => {
    const onStateUpdate = vi.fn();
    const network = new CatanNetwork({
      onStateUpdate,
      onError: vi.fn(),
    });

    (network as any).state = makeStateWithPendingBotDisplacedMove();

    (network as any).runBotTurns();

    const state = network.currentState!;
    const edgeId = Object.keys(graph.edges)[0]!;
    const [from, to] = graph.verticesOfEdge[edgeId]!;
    expect(state.pendingDisplace).toBeNull();
    expect(state.phase).toBe("ACTION");
    expect(state.board.knights[from]?.playerId).toBe("p1");
    expect(state.board.knights[to]?.playerId).toBe("p2");
    expect(onStateUpdate).toHaveBeenCalled();
  });
});

describe("CatanNetwork master control authority", () => {
  it("rejects admin actions from non-host clients", () => {
    const onError = vi.fn();
    const network = new CatanNetwork({
      onStateUpdate: vi.fn(),
      onError,
    });

    (network as any).isHost = false;
    network.sendAction({ type: "ADMIN_UNDO_LAST" });

    expect(onError).toHaveBeenCalledWith("Master controls are host-only");
  });

  it("supports one-step undo for host master actions", () => {
    const network = new CatanNetwork({
      onStateUpdate: vi.fn(),
      onError: vi.fn(),
    });
    const state = createInitialState([
      { id: "p1", name: "Player 1", color: "#e74c3c", isBot: false },
      { id: "p2", name: "Player 2", color: "#3498db", isBot: false },
    ]);
    const numbered = Object.values(state.board.hexes).filter(
      (h) => h.number !== null,
    );
    const a = numbered[0]!;
    const b = numbered[1]!;

    (network as any).isHost = true;
    (network as any).state = state;

    network.sendAction({
      type: "ADMIN_SWAP_NUMBER_TOKENS",
      hidA: a.id,
      hidB: b.id,
      reason: "test",
    });

    expect(network.currentState!.board.hexes[a.id]!.number).toBe(b.number);

    network.sendAction({ type: "ADMIN_UNDO_LAST" });

    expect(network.currentState!.board.hexes[a.id]!.number).toBe(a.number);
  });
});
