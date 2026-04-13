import { describe, it, expect } from "vitest";
import {
  createInitialState,
  applyAction,
  computeVP,
} from "../../lib/catan/game.js";
import {
  buildGraph,
  computeLongestRoad,
  CATAN_HEX_COORDS,
  hexId,
} from "../../lib/catan/board.js";
import { STANDARD_BOARD, HARBOR_SETUPS } from "../../lib/catan/constants.js";
import type {
  GameState,
  PlayerId,
  VertexId,
  EdgeId,
} from "../../lib/catan/types.js";

const graph = buildGraph();
const HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

function hasAdjacentRedTokens(state: GameState): boolean {
  const byId = state.board.hexes;
  for (const hex of Object.values(byId)) {
    if (hex.number !== 6 && hex.number !== 8) continue;
    for (const d of HEX_DIRECTIONS) {
      const nid = hexId({ q: hex.coord.q + d.q, r: hex.coord.r + d.r });
      const neighbor = byId[nid];
      if (neighbor && (neighbor.number === 6 || neighbor.number === 8)) {
        return true;
      }
    }
  }
  return false;
}

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

  it("uses C&K-correct Constitution and TradeMonopoly deck placement", () => {
    const state = createInitialState(makePlayers(3));

    const tradeConstitutionCount = state.decks.trade.filter(
      (c) => c.name === "Constitution",
    ).length;
    const politicsConstitutionCount = state.decks.politics.filter(
      (c) => c.name === "Constitution",
    ).length;
    const tradeMonopolyCount = state.decks.trade.filter(
      (c) => c.name === "TradeMonopoly",
    ).length;
    const politicsWeddingCount = state.decks.politics.filter(
      (c) => c.name === "Wedding",
    ).length;

    expect(tradeConstitutionCount).toBe(0);
    expect(politicsConstitutionCount).toBe(1);
    expect(tradeMonopolyCount).toBe(2);
    expect(politicsWeddingCount).toBe(2);
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

  it("preset A keeps the current board, harbor, and player order configuration", () => {
    const players = makePlayers(4);
    const state = createInitialState(players, { boardPreset: "A" });

    const actualHexSignature = CATAN_HEX_COORDS.map((coord) => {
      const hex = state.board.hexes[hexId(coord)]!;
      return `${hex.coord.q},${hex.coord.r}:${hex.terrain}:${hex.number}`;
    });
    const expectedHexSignature = STANDARD_BOARD.map(
      (hex) => `${hex.coord.q},${hex.coord.r}:${hex.terrain}:${hex.number}`,
    );
    expect(actualHexSignature).toEqual(expectedHexSignature);

    const actualHarborSignature = state.board.harbors.map((harbor) => {
      const key = [...harbor.vertices].sort().join("|");
      return `${harbor.type}:${key}`;
    });
    const expectedHarborSignature = HARBOR_SETUPS.map((setup) => {
      const hid = hexId(setup.hexCoord);
      const hexVerts = graph.verticesOfHex[hid] ?? [];
      const vA = hexVerts[setup.edgeIndex] ?? hexVerts[0]!;
      const vB = hexVerts[(setup.edgeIndex + 1) % 6] ?? hexVerts[1]!;
      const key = [vA, vB].sort().join("|");
      return `${setup.type}:${key}`;
    });
    expect(actualHarborSignature).toEqual(expectedHarborSignature);

    expect(state.playerOrder).toEqual(players.map((p) => p.id));
  });

  it("random preset preserves board and harbor composition counts", () => {
    const state = createInitialState(makePlayers(4), { boardPreset: "random" });

    const terrainCounts = Object.values(state.board.hexes).reduce(
      (acc, hex) => {
        acc[hex.terrain] = (acc[hex.terrain] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const expectedTerrainCounts = STANDARD_BOARD.reduce(
      (acc, hex) => {
        acc[hex.terrain] = (acc[hex.terrain] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    expect(terrainCounts).toEqual(expectedTerrainCounts);

    const numberCounts = Object.values(state.board.hexes)
      .map((hex) => hex.number)
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    const expectedNumberCounts = STANDARD_BOARD.map((hex) => hex.number)
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    expect(numberCounts).toEqual(expectedNumberCounts);

    const harborTypeCounts = state.board.harbors.reduce(
      (acc, harbor) => {
        acc[harbor.type] = (acc[harbor.type] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    const expectedHarborTypeCounts = HARBOR_SETUPS.reduce(
      (acc, harbor) => {
        acc[harbor.type] = (acc[harbor.type] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    expect(state.board.harbors).toHaveLength(HARBOR_SETUPS.length);
    expect(harborTypeCounts).toEqual(expectedHarborTypeCounts);
  });

  it("random preset never places adjacent 6/8 tokens", () => {
    for (let i = 0; i < 30; i++) {
      const state = createInitialState(makePlayers(4), {
        boardPreset: "random",
      });
      expect(hasAdjacentRedTokens(state)).toBe(false);
    }
  });

  it("random preset randomizes player order", () => {
    const players = makePlayers(4);
    const originalOrder = players.map((p) => p.id);

    let foundDifferentOrder = false;
    for (let i = 0; i < 20; i++) {
      const state = createInitialState(players, { boardPreset: "random" });
      if (state.playerOrder.join("|") !== originalOrder.join("|")) {
        foundDifferentOrder = true;
        break;
      }
    }

    expect(foundDifferentOrder).toBe(true);
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
    const result = applyAction(state, {
      type: "ROLL_DICE",
      pid,
      result: [hexNum - 1, 1, "politics" as const],
    });

    // Production resolves inline on main branch
    expect(result.phase).toBe("ACTION");

    // After production, player should have more resources
    const after = result.players[pid]!.resources;
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
    const result = applyAction(state, {
      type: "ROLL_DICE",
      pid,
      result: [hexNum - 1, 1, "politics" as const],
    });

    // Production resolves inline on main branch
    expect(result.phase).toBe("ACTION");

    const after = result.players[pid]!.resources;
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

    const result = applyAction(state, {
      type: "ROLL_DICE",
      pid,
      result: [6, 3, "science" as const],
    });

    // Progress draw resolves immediately on this branch
    expect(result.phase).toBe("RESOLVE_PROGRESS_DRAW");

    expect(result.pendingProgressDraw?.track).toBe("science");
    expect(result.pendingProgressDraw?.remaining).toContain(pid);
    expect(result.phase).toBe("RESOLVE_PROGRESS_DRAW");
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

describe("progress card effects", () => {
  it("Encouragement activates all of the current player's knights", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;
    const knightVertex = Object.keys(graph.vertices)[0] as VertexId;

    state = {
      ...state,
      phase: "ACTION",
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          progressCards: [
            { name: "Encouragement", track: "politics", isVP: false },
          ],
        },
      },
      board: {
        ...state.board,
        knights: {
          ...state.board.knights,
          [knightVertex]: { playerId: pid, strength: 2, active: false },
        },
      },
    };

    const next = applyAction(state, {
      type: "PLAY_PROGRESS",
      pid,
      card: "Encouragement",
    });

    expect(next.board.knights[knightVertex]?.active).toBe(true);
  });

  it("ResourceMonopoly takes up to 2 named resources from each opponent", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;
    const opponents = state.playerOrder.filter((p) => p !== pid);
    const before = state.players[pid]!.resources.ore;

    state = {
      ...state,
      phase: "ACTION",
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          progressCards: [
            { name: "ResourceMonopoly", track: "trade", isVP: false },
          ],
        },
        [opponents[0]!]: {
          ...state.players[opponents[0]!]!,
          resources: { ...state.players[opponents[0]!]!.resources, ore: 4 },
        },
        [opponents[1]!]: {
          ...state.players[opponents[1]!]!,
          resources: { ...state.players[opponents[1]!]!.resources, ore: 1 },
        },
      },
    };

    const next = applyAction(state, {
      type: "PLAY_PROGRESS",
      pid,
      card: "ResourceMonopoly",
      params: { resource: "ore" },
    });

    expect(next.players[pid]!.resources.ore).toBe(before + 3);
    expect(next.players[opponents[0]!]!.resources.ore).toBe(2);
    expect(next.players[opponents[1]!]!.resources.ore).toBe(0);
    expect(next.log.at(-1)).toBe(
      `${next.players[pid]!.name} gained from [{card}|name=ResourceMonopoly]. [{delta}|kind=ore&amount=3]`,
    );
  });

  it("TradeMonopoly takes one named commodity from each opponent", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;
    const opponents = state.playerOrder.filter((p) => p !== pid);
    const before = state.players[pid]!.resources.cloth;

    state = {
      ...state,
      phase: "ACTION",
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          progressCards: [
            { name: "TradeMonopoly", track: "trade", isVP: false },
          ],
        },
        [opponents[0]!]: {
          ...state.players[opponents[0]!]!,
          resources: { ...state.players[opponents[0]!]!.resources, cloth: 2 },
        },
        [opponents[1]!]: {
          ...state.players[opponents[1]!]!,
          resources: { ...state.players[opponents[1]!]!.resources, cloth: 0 },
        },
      },
    };

    const next = applyAction(state, {
      type: "PLAY_PROGRESS",
      pid,
      card: "TradeMonopoly",
      params: { commodity: "cloth" },
    });

    expect(next.players[pid]!.resources.cloth).toBe(before + 1);
    expect(next.players[opponents[0]!]!.resources.cloth).toBe(1);
    expect(next.players[opponents[1]!]!.resources.cloth).toBe(0);
    expect(next.log.at(-1)).toBe(
      `${next.players[pid]!.name} gained from [{card}|name=TradeMonopoly]. [{delta}|kind=cloth&amount=1]`,
    );
  });

  it("Wedding collects two cards from each opponent with more VP", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;
    const opponents = state.playerOrder.filter((p) => p !== pid);
    const donor = opponents[0]!;
    const nonDonor = opponents[1]!;

    state = {
      ...state,
      phase: "ACTION",
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          vpTokens: 0,
          progressCards: [{ name: "Wedding", track: "politics", isVP: false }],
          resources: {
            brick: 0,
            lumber: 0,
            ore: 0,
            grain: 0,
            wool: 0,
            cloth: 0,
            coin: 0,
            paper: 0,
          },
        },
        [donor]: {
          ...state.players[donor]!,
          vpTokens: 2,
          resources: {
            brick: 0,
            lumber: 0,
            ore: 0,
            grain: 2,
            wool: 2,
            cloth: 0,
            coin: 0,
            paper: 0,
          },
        },
        [nonDonor]: {
          ...state.players[nonDonor]!,
          vpTokens: 0,
          resources: {
            brick: 0,
            lumber: 0,
            ore: 0,
            grain: 2,
            wool: 2,
            cloth: 0,
            coin: 0,
            paper: 0,
          },
        },
      },
    };

    const before = Object.values(state.players[pid]!.resources).reduce(
      (a, b) => a + b,
      0,
    );

    const next = applyAction(state, {
      type: "PLAY_PROGRESS",
      pid,
      card: "Wedding",
    });

    const after = Object.values(next.players[pid]!.resources).reduce(
      (a, b) => a + b,
      0,
    );
    expect(after - before).toBe(2);
    expect(next.log.at(-1)).toBe(
      `${next.players[pid]!.name} gained from [{card}|name=Wedding]. [{delta}|kind=wool&amount=2]`,
    );
  });

  it("Wedding with no eligible opponents still consumes and logs silly message", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;

    state = {
      ...state,
      phase: "ACTION",
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          vpTokens: 3,
          progressCards: [{ name: "Wedding", track: "politics", isVP: false }],
        },
      },
    };

    const next = applyAction(state, {
      type: "PLAY_PROGRESS",
      pid,
      card: "Wedding",
    });

    expect(
      next.players[pid]!.progressCards.some((c) => c.name === "Wedding"),
    ).toBe(false);
    expect(next.log.at(-1)).toBe(
      `oh hmm oops that's not what ${next.players[pid]!.name} had in mind I'm sure...`,
    );
  });

  it("ResourceMonopoly with zero available cards still consumes and logs silly message", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;
    const opponents = state.playerOrder.filter((p) => p !== pid);

    state = {
      ...state,
      phase: "ACTION",
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          progressCards: [
            { name: "ResourceMonopoly", track: "trade", isVP: false },
          ],
        },
        [opponents[0]!]: {
          ...state.players[opponents[0]!]!,
          resources: { ...state.players[opponents[0]!]!.resources, ore: 0 },
        },
        [opponents[1]!]: {
          ...state.players[opponents[1]!]!,
          resources: { ...state.players[opponents[1]!]!.resources, ore: 0 },
        },
      },
    };

    const next = applyAction(state, {
      type: "PLAY_PROGRESS",
      pid,
      card: "ResourceMonopoly",
      params: { resource: "ore" },
    });

    expect(
      next.players[pid]!.progressCards.some(
        (c) => c.name === "ResourceMonopoly",
      ),
    ).toBe(false);
    expect(next.log.at(-1)).toBe(
      `oh hmm oops that's not what ${next.players[pid]!.name} had in mind I'm sure...`,
    );
  });

  it("logs Irrigation gains with delta tokens", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;
    const before = state.players[pid]!.resources.grain;

    state = {
      ...state,
      phase: "ACTION",
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          progressCards: [
            { name: "Irrigation", track: "science", isVP: false },
          ],
        },
      },
    };

    const next = applyAction(state, {
      type: "PLAY_PROGRESS",
      pid,
      card: "Irrigation",
    });

    const gained = next.players[pid]!.resources.grain - before;
    expect(gained).toBeGreaterThan(0);
    expect(next.log.at(-1)).toBe(
      `${next.players[pid]!.name} gained from [{card}|name=Irrigation]. [{delta}|kind=grain&amount=${gained}]`,
    );
  });

  it("logs Mining gains with delta tokens", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;
    const before = state.players[pid]!.resources.ore;

    state = {
      ...state,
      phase: "ACTION",
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          progressCards: [{ name: "Mining", track: "science", isVP: false }],
        },
      },
    };

    const next = applyAction(state, {
      type: "PLAY_PROGRESS",
      pid,
      card: "Mining",
    });

    const gained = next.players[pid]!.resources.ore - before;
    expect(gained).toBeGreaterThan(0);
    expect(next.log.at(-1)).toBe(
      `${next.players[pid]!.name} gained from [{card}|name=Mining]. [{delta}|kind=ore&amount=${gained}]`,
    );
  });

  it("logs Medicine cost with delta tokens", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;
    const targetVid = Object.entries(state.board.vertices).find(
      ([, b]) => b?.type === "settlement" && b.playerId === pid,
    )?.[0] as VertexId;

    state = {
      ...state,
      phase: "ACTION",
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          progressCards: [{ name: "Medicine", track: "science", isVP: false }],
        },
      },
    };

    const next = applyAction(state, {
      type: "PLAY_PROGRESS",
      pid,
      card: "Medicine",
      params: { vid: targetVid },
    });

    expect(next.log.at(-1)).toBe(
      `${next.players[pid]!.name} resolved [{card}|name=Medicine]. [{delta}|kind=ore&amount=-2] [{delta}|kind=grain&amount=-1]`,
    );
  });

  it("Alchemy can be played in roll phase and sets both production dice", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;

    state = {
      ...state,
      phase: "ROLL_DICE",
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          progressCards: [{ name: "Alchemy", track: "science", isVP: false }],
        },
      },
    };

    const next = applyAction(state, {
      type: "PLAY_PROGRESS",
      pid,
      card: "Alchemy",
      params: { die1: 6, die2: 1 },
    });

    expect(next.lastRoll?.[0]).toBe(6);
    expect(next.lastRoll?.[1]).toBe(1);
    expect(
      next.players[pid]!.progressCards.some((c) => c.name === "Alchemy"),
    ).toBe(false);
  });

  it("does not allow non-Alchemy progress cards during roll phase", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;

    state = {
      ...state,
      phase: "ROLL_DICE",
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          progressCards: [
            { name: "Irrigation", track: "science", isVP: false },
          ],
        },
      },
    };

    const next = applyAction(state, {
      type: "PLAY_PROGRESS",
      pid,
      card: "Irrigation",
    });

    expect(
      next.players[pid]!.progressCards.some((c) => c.name === "Irrigation"),
    ).toBe(true);
  });

  it("does not consume ResourceMonopoly card when required param is missing", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;

    state = {
      ...state,
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          progressCards: [
            { name: "ResourceMonopoly", track: "trade", isVP: false },
          ],
        },
      },
    };

    const next = applyAction(state, {
      type: "PLAY_PROGRESS",
      pid,
      card: "ResourceMonopoly",
    });

    expect(
      next.players[pid]!.progressCards.some(
        (c) => c.name === "ResourceMonopoly",
      ),
    ).toBe(true);
  });

  it("Crane applies a one-time city improvement discount", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;

    state = {
      ...state,
      phase: "ACTION",
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          resources: { ...state.players[pid]!.resources, paper: 5 },
          improvements: {
            ...state.players[pid]!.improvements,
            science: 1,
          },
          progressCards: [{ name: "Crane", track: "science", isVP: false }],
        },
      },
    };

    const withCrane = applyAction(state, {
      type: "PLAY_PROGRESS",
      pid,
      card: "Crane",
      params: { track: "science" },
    });
    const improved = applyAction(withCrane, {
      type: "IMPROVE_CITY",
      pid,
      track: "science",
    });

    expect(improved.players[pid]!.improvements.science).toBe(2);
    expect(improved.players[pid]!.resources.paper).toBe(4);
    expect(improved.progressEffects.craneDiscountPlayerId).toBeNull();
  });

  it("MerchantFleet sets and clears a turn-scoped 2:1 trade type", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;

    state = {
      ...state,
      phase: "ACTION",
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          progressCards: [
            { name: "MerchantFleet", track: "trade", isVP: false },
          ],
        },
      },
    };

    const withFleet = applyAction(state, {
      type: "PLAY_PROGRESS",
      pid,
      card: "MerchantFleet",
      params: { cardType: "coin" },
    });

    expect(withFleet.progressEffects.merchantFleet?.playerId).toBe(pid);
    expect(withFleet.progressEffects.merchantFleet?.cardType).toBe("coin");

    const ended = applyAction(withFleet, {
      type: "END_TURN",
      pid,
    });
    expect(ended.progressEffects.merchantFleet).toBeNull();
  });

  it("logs played progress cards with a clickable card marker", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;

    state = {
      ...state,
      phase: "ACTION",
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          progressCards: [
            { name: "Irrigation", track: "science", isVP: false },
          ],
        },
      },
    };

    const next = applyAction(state, {
      type: "PLAY_PROGRESS",
      pid,
      card: "Irrigation",
    });

    expect(
      next.log.some((line) =>
        line.includes(
          `${state.players[pid]!.name} played [{card}|name=Irrigation].`,
        ),
      ),
    ).toBe(true);
  });
});

describe("action logging", () => {
  it("logs rolls with die widget tokens", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;
    state = { ...state, phase: "ROLL_DICE" };

    const rolled = applyAction(state, {
      type: "ROLL_DICE",
      pid,
      result: [4, 3, "trade"],
    });

    expect(rolled.log.at(-1)).toBe(
      `${rolled.players[pid]!.name} rolled [{die-yellow}|value=4] [{die-red}|value=3] = 7 [{event-die}|face=trade]`,
    );
  });

  it("logs build and economy actions in past tense", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;

    const targetSettlementVertex = findEmptyVertex(state);
    state = {
      ...state,
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          resources: {
            ...state.players[pid]!.resources,
            brick: 10,
            lumber: 10,
            grain: 10,
            wool: 10,
            ore: 10,
            paper: 10,
            cloth: 10,
            coin: 10,
          },
        },
      },
    };

    const builtSettlement = applyAction(state, {
      type: "BUILD_SETTLEMENT",
      pid,
      vid: targetSettlementVertex,
    });
    expect(
      builtSettlement.log.some((line) => line.includes("built a settlement.")),
    ).toBe(true);

    const cityTarget = Object.entries(builtSettlement.board.vertices).find(
      ([, b]) => b?.type === "settlement" && b.playerId === pid,
    )?.[0] as VertexId;
    const builtCity = applyAction(builtSettlement, {
      type: "BUILD_CITY",
      pid,
      vid: cityTarget,
    });
    expect(builtCity.log.at(-1)).toBe(
      `${builtCity.players[pid]!.name} built a city. [{delta}|kind=ore&amount=-3] [{delta}|kind=grain&amount=-2]`,
    );

    const roadEdge = Object.entries(builtCity.board.edges).find(
      ([, road]) => road === null,
    )?.[0]!;
    const builtRoad = applyAction(builtCity, {
      type: "BUILD_ROAD",
      pid,
      eid: roadEdge,
    });
    expect(builtRoad.log.at(-1)).toBe(
      `${builtRoad.players[pid]!.name} built a road. [{delta}|kind=brick&amount=-1] [{delta}|kind=lumber&amount=-1]`,
    );

    const walled = applyAction(builtRoad, {
      type: "BUILD_CITY_WALL",
      pid,
      vid: cityTarget,
    });
    expect(walled.log.some((line) => line.includes("built a city wall."))).toBe(
      true,
    );

    const improved = applyAction(walled, {
      type: "IMPROVE_CITY",
      pid,
      track: "science",
    });
    expect(
      improved.log.some((line) =>
        line.includes("improved science to level 1."),
      ),
    ).toBe(true);

    const robberHex = Object.keys(improved.board.hexes)[0]!;
    const movedRobber = applyAction(improved, {
      type: "MOVE_ROBBER",
      pid,
      hid: robberHex,
      stealFrom: null,
    });
    expect(
      movedRobber.log.some((line) => line.includes("moved the robber.")),
    ).toBe(true);

    const discarded = applyAction(movedRobber, {
      type: "DISCARD",
      pid,
      cards: { grain: 2, wool: 1 },
    });
    expect(discarded.log.at(-1)).toBe(
      `${discarded.players[pid]!.name} discarded 3 resource cards. [{delta}|kind=grain&amount=-2] [{delta}|kind=wool&amount=-1]`,
    );

    const drew = applyAction(discarded, {
      type: "DRAW_PROGRESS",
      pid,
      track: "science",
    });
    expect(
      drew.log.some((line) => line.includes("drew a science progress card.")),
    ).toBe(true);

    const traded = applyAction(drew, {
      type: "TRADE_BANK",
      pid,
      give: { grain: 4 },
      get: { ore: 1 },
    });
    expect(traded.log.at(-1)).toBe(
      `${traded.players[pid]!.name} traded with the bank. [{delta}|kind=grain&amount=-4] [{delta}|kind=ore&amount=1]`,
    );
  });

  it("logs knight actions in past tense", () => {
    let state = buildActionState();
    const pid = state.currentPlayerId;
    const knightVertex = findEmptyVertex(state);

    state = {
      ...state,
      players: {
        ...state.players,
        [pid]: {
          ...state.players[pid]!,
          resources: {
            ...state.players[pid]!.resources,
            ore: 5,
            grain: 5,
            wool: 5,
          },
        },
      },
    };

    const recruited = applyAction(state, {
      type: "RECRUIT_KNIGHT",
      pid,
      vid: knightVertex,
    });
    expect(recruited.log.at(-1)).toBe(
      `${recruited.players[pid]!.name} recruited a knight. [{delta}|kind=ore&amount=-1] [{delta}|kind=wool&amount=-1]`,
    );

    const promoted = applyAction(recruited, {
      type: "PROMOTE_KNIGHT",
      pid,
      vid: knightVertex,
    });
    expect(promoted.log.at(-1)).toBe(
      `${promoted.players[pid]!.name} promoted a knight. [{delta}|kind=ore&amount=-1] [{delta}|kind=wool&amount=-1]`,
    );

    const activated = applyAction(promoted, {
      type: "ACTIVATE_KNIGHT",
      pid,
      vid: knightVertex,
    });
    expect(activated.log.at(-1)).toBe(
      `${activated.players[pid]!.name} activated a knight. [{delta}|kind=grain&amount=-1]`,
    );
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

describe("master control actions", () => {
  it("swaps number tokens between two numbered hexes", () => {
    const state = buildActionState();
    const numbered = Object.values(state.board.hexes).filter(
      (h) => h.number !== null,
    );
    const a = numbered[0]!;
    const b = numbered[1]!;

    const next = applyAction(state, {
      type: "ADMIN_SWAP_NUMBER_TOKENS",
      hidA: a.id,
      hidB: b.id,
      reason: "debug swap",
    });

    expect(next.board.hexes[a.id]!.number).toBe(b.number);
    expect(next.board.hexes[b.id]!.number).toBe(a.number);
  });

  it("grants a progress card from finite deck to target player", () => {
    const state = buildActionState();
    const beforeDeck = state.decks.science.length;
    const beforeHand = state.players.p2!.progressCards.length;

    const next = applyAction(state, {
      type: "ADMIN_GRANT_PROGRESS_CARD",
      pid: "p2",
      track: "science",
      reason: "compensation",
    });

    expect(next.decks.science.length).toBe(beforeDeck - 1);
    expect(next.players.p2!.progressCards.length).toBe(beforeHand + 1);
  });

  it("grants any mix of resource and commodity cards to a target player", () => {
    const state = buildActionState();
    const before = state.players.p2!.resources;

    const next = applyAction(state, {
      type: "ADMIN_GRANT_CARDS",
      pid: "p2",
      cards: { brick: 2, paper: 1, coin: 3 },
      reason: "repair",
    });

    expect(next.players.p2!.resources.brick).toBe(before.brick + 2);
    expect(next.players.p2!.resources.paper).toBe(before.paper + 1);
    expect(next.players.p2!.resources.coin).toBe(before.coin + 3);
  });

  it("ignores ADMIN_GRANT_CARDS when all granted amounts are zero", () => {
    const state = buildActionState();
    const before = state.players.p2!.resources;

    const next = applyAction(state, {
      type: "ADMIN_GRANT_CARDS",
      pid: "p2",
      cards: { brick: 0, wool: 0, cloth: 0 },
      reason: "no-op",
    });

    expect(next.players.p2!.resources).toEqual(before);
  });

  it("converts a human player to bot mode", () => {
    const state = buildActionState();
    expect(state.players.p2!.isBot).toBe(false);

    const next = applyAction(state, {
      type: "ADMIN_SET_PLAYER_BOT",
      pid: "p2",
      isBot: true,
      reason: "host removed player",
    });

    expect(next.players.p2!.isBot).toBe(true);
  });

  it("clears selected pending state fields via host admin action", () => {
    const state = buildActionState();
    const next = applyAction(
      {
        ...state,
        phase: "RESOLVE_PROGRESS_DRAW",
        pendingProgressDraw: { remaining: ["p2"], track: "science" },
        pendingDiscard: { remaining: { p1: 2 } },
      },
      {
        type: "ADMIN_CLEAR_PENDING_STATE",
        fields: ["pendingProgressDraw"],
        reason: "unstick draw",
      },
    );

    expect(next.pendingProgressDraw).toBeNull();
    expect(next.pendingDiscard).toEqual({ remaining: { p1: 2 } });
    expect(next.phase).toBe("RESOLVE_PROGRESS_DRAW");
  });

  it("can clear pending state and set a recovery phase in one admin action", () => {
    const state = buildActionState();
    const next = applyAction(
      {
        ...state,
        phase: "DISCARD",
        pendingDiscard: { remaining: { p1: 2, p2: 1 } },
      },
      {
        type: "ADMIN_CLEAR_PENDING_STATE",
        fields: ["pendingDiscard"],
        phase: "ACTION",
        reason: "recover from stuck discard",
      },
    );

    expect(next.pendingDiscard).toBeNull();
    expect(next.phase).toBe("ACTION");
  });

  it("sets barbarian progress via host admin action", () => {
    const state = buildActionState();

    const next = applyAction(state, {
      type: "ADMIN_SET_BARBARIAN_PROGRESS",
      position: 6,
      reason: "repair track",
    });

    expect(next.barbarian.position).toBe(6);
  });

  it("clamps barbarian progress to valid track bounds", () => {
    const state = buildActionState();

    const low = applyAction(state, {
      type: "ADMIN_SET_BARBARIAN_PROGRESS",
      position: -2,
    });
    const high = applyAction(state, {
      type: "ADMIN_SET_BARBARIAN_PROGRESS",
      position: 99,
    });

    expect(low.barbarian.position).toBe(0);
    expect(high.barbarian.position).toBe(7);
  });
});

// ─── Longest road tie-break ───────────────────────────────────────────────────

describe("updateLongestRoad tie-break", () => {
  /** Build a simple-path DFS chain of exactly `length` edges from startVid, updating usedEdges. */
  function buildRoadChain(
    startVid: VertexId,
    length: number,
    usedEdges: Set<string>,
  ): EdgeId[] {
    function dfs(
      vid: VertexId,
      remaining: number,
      path: EdgeId[],
      visited: Set<VertexId>,
    ): EdgeId[] | null {
      if (remaining === 0) return path;
      for (const eid of graph.edgesOfVertex[vid] ?? []) {
        if (usedEdges.has(eid)) continue;
        const [a, b] = graph.verticesOfEdge[eid]!;
        const next = (a === vid ? b : a) as VertexId;
        if (visited.has(next)) continue;
        usedEdges.add(eid);
        visited.add(next);
        const result = dfs(
          next,
          remaining - 1,
          [...path, eid as EdgeId],
          visited,
        );
        if (result) return result;
        usedEdges.delete(eid);
        visited.delete(next);
      }
      return null;
    }
    const visited = new Set<VertexId>([startVid]);
    return dfs(startVid, length, [], visited) ?? [];
  }

  /**
   * Find any vertex that can anchor a chain of `length` non-overlapping edges
   * (skipping vertices already blocked by usedEdges).
   */
  function buildChainFromAnyVertex(
    length: number,
    usedEdges: Set<string>,
  ): EdgeId[] {
    for (const vid of Object.keys(graph.vertices) as VertexId[]) {
      const result = buildRoadChain(vid, length, usedEdges);
      if (result.length === length) return result;
    }
    return [];
  }

  it("current owner keeps the award when a challenger ties from an earlier playerOrder position", () => {
    const base = buildActionState();
    // Default playerOrder is ["p1","p2","p3"] — p1 is before p2.
    // Set p2 as owner so p1 (appearing first in iteration) is the challenger.
    const usedEdges = new Set<string>();

    // Use any two non-overlapping chains; not tied to specific vertices so
    // the board layout can't accidentally block one.
    const p1Chain = buildChainFromAnyVertex(5, usedEdges);
    const p2Chain = buildChainFromAnyVertex(5, usedEdges);
    expect(p1Chain).toHaveLength(5);
    expect(p2Chain).toHaveLength(5);

    // Clear all vertices so opponent buildings don't interrupt road traversal
    const clearedVertices = Object.fromEntries(
      Object.keys(graph.vertices).map((v) => [v, null]),
    );
    const clearedEdges = Object.fromEntries(
      Object.keys(graph.edges).map((e) => [e, null]),
    );
    const state: GameState = {
      ...base,
      longestRoadOwner: "p2" as PlayerId,
      longestRoadLength: 5,
      board: {
        ...base.board,
        vertices: clearedVertices as any,
        edges: {
          ...clearedEdges,
          ...Object.fromEntries(
            p1Chain.map((e) => [e, { playerId: "p1" as PlayerId }]),
          ),
          ...Object.fromEntries(
            p2Chain.map((e) => [e, { playerId: "p2" as PlayerId }]),
          ),
        } as any,
      },
    };

    expect(computeLongestRoad(state.board, graph, "p1")).toBe(5);
    expect(computeLongestRoad(state.board, graph, "p2")).toBe(5);

    // p3 builds a disconnected road to trigger updateLongestRoad without changing p1/p2 lengths
    const p3Edge = Object.keys(graph.edges).find(
      (e) => !usedEdges.has(e),
    )! as EdgeId;
    const after = applyAction(state, {
      type: "BUILD_ROAD",
      pid: "p3" as PlayerId,
      eid: p3Edge,
    });

    expect(after.longestRoadOwner).toBe("p2");
    expect(after.longestRoadLength).toBe(5);
  });

  it("challenger with strictly more roads correctly takes the award", () => {
    const base = buildActionState();
    const usedEdges = new Set<string>();

    const p2Chain = buildChainFromAnyVertex(5, usedEdges);
    const p1Chain = buildChainFromAnyVertex(6, usedEdges);
    expect(p1Chain).toHaveLength(6);
    expect(p2Chain).toHaveLength(5);

    const clearedVertices = Object.fromEntries(
      Object.keys(graph.vertices).map((v) => [v, null]),
    );
    const clearedEdges = Object.fromEntries(
      Object.keys(graph.edges).map((e) => [e, null]),
    );
    const state: GameState = {
      ...base,
      longestRoadOwner: "p2" as PlayerId,
      longestRoadLength: 5,
      board: {
        ...base.board,
        vertices: clearedVertices as any,
        edges: {
          ...clearedEdges,
          ...Object.fromEntries(
            p1Chain.map((e) => [e, { playerId: "p1" as PlayerId }]),
          ),
          ...Object.fromEntries(
            p2Chain.map((e) => [e, { playerId: "p2" as PlayerId }]),
          ),
        } as any,
      },
    };

    expect(computeLongestRoad(state.board, graph, "p1")).toBe(6);
    expect(computeLongestRoad(state.board, graph, "p2")).toBe(5);

    const p3Edge = Object.keys(graph.edges).find(
      (e) => !usedEdges.has(e),
    )! as EdgeId;
    const after = applyAction(state, {
      type: "BUILD_ROAD",
      pid: "p3" as PlayerId,
      eid: p3Edge,
    });

    expect(after.longestRoadOwner).toBe("p1");
    expect(after.longestRoadLength).toBe(6);
  });
});

// ─── Progress card hand limit ─────────────────────────────────────────────────

describe("progress card hand limit (4 non-VP)", () => {
  const nonVpCard = {
    name: "RoadBuilding" as const,
    track: "science" as const,
    isVP: false,
  };
  const vpCard = {
    name: "Printing" as const,
    track: "science" as const,
    isVP: true,
  };

  it("DRAW_PROGRESS is ignored when the player already holds 4 non-VP cards", () => {
    const base = buildActionState();
    const pid = base.currentPlayerId;
    const state: GameState = {
      ...base,
      players: {
        ...base.players,
        [pid]: {
          ...base.players[pid]!,
          progressCards: [nonVpCard, nonVpCard, nonVpCard, nonVpCard],
        },
      },
    };
    const after = applyAction(state, {
      type: "DRAW_PROGRESS",
      pid,
      track: "science",
    });
    expect(after.players[pid]!.progressCards).toHaveLength(4);
  });

  it("DRAW_PROGRESS succeeds when the 4 held cards are all VP cards", () => {
    const base = buildActionState();
    const pid = base.currentPlayerId;
    const state: GameState = {
      ...base,
      players: {
        ...base.players,
        [pid]: {
          ...base.players[pid]!,
          progressCards: [vpCard, vpCard, vpCard, vpCard],
        },
      },
    };
    const after = applyAction(state, {
      type: "DRAW_PROGRESS",
      pid,
      track: "science",
    });
    // VP cards don't count toward the 4-card limit
    expect(after.players[pid]!.progressCards).toHaveLength(5);
  });
});

// ─── TRADE_REJECT / TRADE_OFFER stubs ─────────────────────────────────────────

describe("unimplemented trade actions return state unchanged", () => {
  it("TRADE_REJECT returns state unchanged (aside from version bump)", () => {
    const state = buildActionState();
    const [p1, p2] = state.playerOrder;
    const after = applyAction(state, {
      type: "TRADE_REJECT",
      from: p1!,
      to: p2!,
    });
    expect(after.version).toBe(state.version + 1);
    expect(after.players).toEqual(state.players);
    expect(after.board).toEqual(state.board);
  });

  it("TRADE_OFFER returns state unchanged (aside from version bump)", () => {
    const state = buildActionState();
    const [p1, p2] = state.playerOrder;
    const after = applyAction(state, {
      type: "TRADE_OFFER",
      from: p1!,
      to: p2!,
      offer: { brick: 1 },
      request: { ore: 1 },
    });
    expect(after.version).toBe(state.version + 1);
    expect(after.players).toEqual(state.players);
    expect(after.board).toEqual(state.board);
  });
});
