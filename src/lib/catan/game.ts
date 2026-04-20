import type {
  GameState,
  GameAction,
  Player,
  PlayerId,
  BoardState,
  VertexId,
  EdgeId,
  HexId,
  ImprovementTrack,
  Resources,
  ResourceType,
  CommodityType,
  ProgressCard,
  KnightStrength,
  ProgressCardName,
  PendingBarbarian,
} from "./types.js";
import { emptyResources } from "./types.js";
import {
  buildGraph,
  hexId,
  computeLongestRoad,
  CATAN_HEX_COORDS,
} from "./board.js";
import {
  type HexSetup,
  type HarborSetup,
  STANDARD_BOARD,
  HARBOR_SETUPS,
  SCIENCE_DECK,
  TRADE_DECK,
  POLITICS_DECK,
  INITIAL_SUPPLY,
  PLAYER_COLORS,
  TRACK_COMMODITY,
  DRAW_MAX,
  rollEventDie,
  rollProductionDie,
  BUILD_COSTS,
} from "./constants.js";
import {
  discardCount,
  isOpenRoad,
  isOnPlayerNetwork,
  progressDiscardCount,
  canTradeBank,
  hasKnightUpTo,
} from "./rules.js";
import {
  logCardToken,
  logDieToken,
  logEventDieToken,
  logResourceDeltaTokens,
} from "./logParsing.js";

// ─── Utilities ────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export type BoardPreset = "A" | "random";

const HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

const TERRAIN_POOL: HexSetup["terrain"][] = STANDARD_BOARD.map(
  (hex) => hex.terrain,
);
const NUMBER_TOKEN_POOL: number[] = STANDARD_BOARD.filter(
  (hex) => hex.number !== null,
).map((hex) => hex.number as number);

function isRedToken(n: number | null): n is 6 | 8 {
  return n === 6 || n === 8;
}

function hasNoAdjacentRedTokens(hexes: HexSetup[]): boolean {
  const byId = new Map(hexes.map((hex) => [hexId(hex.coord), hex]));
  for (const hex of hexes) {
    if (!isRedToken(hex.number)) continue;
    for (const d of HEX_DIRECTIONS) {
      const neighbor = byId.get(
        hexId({ q: hex.coord.q + d.q, r: hex.coord.r + d.r }),
      );
      if (neighbor && isRedToken(neighbor.number)) return false;
    }
  }
  return true;
}

function randomizeBoardHexes(): HexSetup[] {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const terrains = shuffle(TERRAIN_POOL);
    const numbers = shuffle(NUMBER_TOKEN_POOL);
    let numberIdx = 0;

    const candidate = CATAN_HEX_COORDS.map((coord, idx) => {
      const terrain = terrains[idx]!;
      const number = terrain === "desert" ? null : numbers[numberIdx++]!;
      return { coord, terrain, number };
    });

    if (hasNoAdjacentRedTokens(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "Failed to generate random board with non-adjacent 6/8 tokens",
  );
}

function randomizeHarborSetups(): HarborSetup[] {
  const harborTypes = shuffle(HARBOR_SETUPS.map((harbor) => harbor.type));
  const harborAnchors = shuffle(
    HARBOR_SETUPS.map((harbor) => ({
      hexCoord: harbor.hexCoord,
      edgeIndex: harbor.edgeIndex,
    })),
  );

  return harborAnchors.map((anchor, idx) => ({
    type: harborTypes[idx]!,
    hexCoord: anchor.hexCoord,
    edgeIndex: anchor.edgeIndex,
  }));
}

function drawRandomProgressCard(state: GameState, pid: PlayerId): GameState {
  const tracks: ImprovementTrack[] = ["science", "trade", "politics"];
  const availableTracks = tracks.filter(
    (track) => state.decks[track].length > 0,
  );
  if (availableTracks.length === 0) return state;

  const track =
    availableTracks[Math.floor(Math.random() * availableTracks.length)]!;
  const deck = [...state.decks[track]];
  const card = deck.shift();
  if (!card) return state;

  return {
    ...state,
    decks: { ...state.decks, [track]: deck },
    players: {
      ...state.players,
      [pid]: {
        ...state.players[pid]!,
        progressCards: [...state.players[pid]!.progressCards, card],
      },
    },
  };
}

function tryRemoveProgressCardsFromHand(
  hand: ProgressCard[],
  discard: ProgressCard[],
): ProgressCard[] | null {
  const h = [...hand];
  for (const d of discard) {
    const ix = h.findIndex(
      (c) => c.name === d.name && c.track === d.track && c.isVP === d.isVP,
    );
    if (ix === -1) return null;
    h.splice(ix, 1);
  }
  return h;
}

/** Players who must discard non-VP progress cards to reach the 4-card limit */
function pendingProgressDiscardNeeds(s: GameState): Record<PlayerId, number> {
  const out: Record<PlayerId, number> = {};
  for (const id of s.playerOrder) {
    const p = s.players[id];
    if (!p) continue;
    const n = progressDiscardCount(p);
    if (n > 0) out[id] = n;
  }
  return out;
}

function advanceProgressDrawAfterDraw(
  s: GameState,
  drewPid: PlayerId,
): GameState {
  const ppd = s.pendingProgressDraw;
  if (!ppd) return s;
  const remaining = ppd.remaining.filter((p) => p !== drewPid);
  if (remaining.length > 0) {
    return { ...s, pendingProgressDraw: { ...ppd, remaining } };
  }
  const needDiscard = pendingProgressDiscardNeeds(s);
  if (Object.keys(needDiscard).length > 0) {
    return {
      ...s,
      pendingProgressDraw: null,
      phase: "DISCARD_PROGRESS",
      pendingProgressDiscard: { remaining: needDiscard },
    };
  }
  return { ...s, pendingProgressDraw: null, phase: "ACTION" };
}

function applyProductionAfterRoll(
  s: GameState,
  graph: ReturnType<typeof buildGraph>,
  rollerPid: PlayerId,
  production: number,
): GameState {
  if (production === 7) {
    const needDiscard: Record<PlayerId, number> = {};
    for (const [ppid, player] of Object.entries(s.players)) {
      const amount = discardCount(player, s.board);
      if (amount > 0) needDiscard[ppid] = amount;
    }
    if (Object.keys(needDiscard).length > 0) {
      return {
        ...s,
        phase: "DISCARD",
        pendingDiscard: { remaining: needDiscard },
      };
    }
    if (s.barbarian.robberActive) {
      return { ...s, phase: "ROBBER_MOVE" };
    }
    return { ...s, phase: "ACTION" };
  }

  const beforeTotal = Object.values(s.players[rollerPid]!.resources).reduce(
    (a, b) => a + b,
    0,
  );
  let next = distributeResources(s, production, graph);
  const afterTotal = Object.values(next.players[rollerPid]!.resources).reduce(
    (a, b) => a + b,
    0,
  );
  const playerGained = afterTotal > beforeTotal;

  if (!playerGained && next.players[rollerPid]!.improvements.science >= 3) {
    return {
      ...next,
      phase: "SCIENCE_SELECT_RESOURCE",
      pendingScienceBonus: { pid: rollerPid },
    };
  }
  if (
    next.pendingProgressDraw &&
    next.pendingProgressDraw.remaining.length > 0
  ) {
    return { ...next, phase: "RESOLVE_PROGRESS_DRAW" };
  }
  return { ...next, phase: "ACTION" };
}

function addResources(r: Resources, delta: Partial<Resources>): Resources {
  const result = { ...r };
  for (const [k, v] of Object.entries(delta) as [keyof Resources, number][]) {
    result[k] = (result[k] ?? 0) + v;
  }
  return result;
}

function subtractResources(r: Resources, delta: Partial<Resources>): Resources {
  const result = { ...r };
  for (const [k, v] of Object.entries(delta) as [keyof Resources, number][]) {
    result[k] = Math.max(0, (result[k] ?? 0) - v);
  }
  return result;
}

function log(state: GameState, msg: string): GameState {
  return { ...state, log: [...state.log, msg] };
}

function progressCardTag(cardName: string): string {
  return logCardToken(cardName as ProgressCardName);
}

function appendLogTokens(base: string, tokens: string[]): string {
  return tokens.length > 0 ? `${base} ${tokens.join(" ")}` : base;
}

function resourceCostTokens(cost: Partial<Resources>): string[] {
  return logResourceDeltaTokens(cost, -1);
}

function tradeDetailsText(
  give: Partial<Resources>,
  get: Partial<Resources>,
): string {
  return appendLogTokens("", [
    ...logResourceDeltaTokens(give, -1),
    ...logResourceDeltaTokens(get, 1),
  ]).trim();
}

function gainedFromCardText(
  playerName: string,
  cardName: ProgressCardName,
  gains: Partial<Resources>,
): string {
  return appendLogTokens(
    `${playerName} gained from ${progressCardTag(cardName)}.`,
    logResourceDeltaTokens(gains, 1),
  );
}

function resolvedCardText(
  playerName: string,
  cardName: ProgressCardName,
  costs: Partial<Resources>,
): string {
  return appendLogTokens(
    `${playerName} resolved ${progressCardTag(cardName)}.`,
    logResourceDeltaTokens(costs, -1),
  );
}

function sillyNoOpProgressText(playerName: string): string {
  return `oh hmm oops that's not what ${playerName} had in mind I'm sure...`;
}

// ─── createInitialState ───────────────────────────────────────────────────────

export function createInitialState(
  players: { id: PlayerId; name: string; color: string; isBot: boolean }[],
  options: { boardPreset?: BoardPreset } = {},
): GameState {
  const graph = buildGraph();
  const boardPreset = options.boardPreset ?? "A";
  const boardSetup =
    boardPreset === "random" ? randomizeBoardHexes() : STANDARD_BOARD;
  const harborSetup =
    boardPreset === "random" ? randomizeHarborSetups() : HARBOR_SETUPS;

  // Build board hexes from selected layout
  const hexes: BoardState["hexes"] = {};
  for (const setup of boardSetup) {
    const id = hexId(setup.coord);
    hexes[id] = {
      id,
      coord: setup.coord,
      terrain: setup.terrain,
      number: setup.number,
      hasRobber: false,
    };
  }

  // Build vertex/edge/knight maps (all null)
  const vertices: BoardState["vertices"] = Object.fromEntries(
    Object.keys(graph.vertices).map((v) => [v, null]),
  );
  const edges: BoardState["edges"] = Object.fromEntries(
    Object.keys(graph.edges).map((e) => [e, null]),
  );
  const knights: BoardState["knights"] = Object.fromEntries(
    Object.keys(graph.vertices).map((v) => [v, null]),
  );

  // Compute harbor vertices from edge positions
  const harbors: BoardState["harbors"] = harborSetup.map((setup) => {
    const hid = hexId(setup.hexCoord);
    const hexVerts = graph.verticesOfHex[hid] ?? [];
    // Edge e connects vertices e and (e+1)%6
    const vA = hexVerts[setup.edgeIndex] ?? hexVerts[0]!;
    const vB = hexVerts[(setup.edgeIndex + 1) % 6] ?? hexVerts[1]!;
    return { type: setup.type, vertices: [vA, vB] as [VertexId, VertexId] };
  });

  // Build player records
  const playerRecords: Record<PlayerId, Player> = {};
  for (let i = 0; i < players.length; i++) {
    const p = players[i]!;
    playerRecords[p.id] = {
      id: p.id,
      name: p.name,
      color: p.color || PLAYER_COLORS[i] || "#999",
      isBot: p.isBot,
      resources: emptyResources(),
      progressCards: [],
      vpTokens: 0,
      improvements: { science: 0, trade: 0, politics: 0 },
      supply: { ...INITIAL_SUPPLY, knights: { ...INITIAL_SUPPLY.knights } },
    };
  }

  const playerOrder =
    boardPreset === "random"
      ? shuffle(players.map((p) => p.id))
      : players.map((p) => p.id);

  return {
    version: 0,
    phase: "SETUP_R1_SETTLEMENT",
    currentPlayerId: playerOrder[0]!,
    playerOrder,
    players: playerRecords,
    board: {
      hexes,
      vertices,
      edges,
      knights,
      harbors,
      merchantHex: null,
      merchantOwner: null,
    },
    barbarian: { position: 0, robberActive: false },
    decks: {
      science: shuffle([...SCIENCE_DECK]),
      trade: shuffle([...TRADE_DECK]),
      politics: shuffle([...POLITICS_DECK]),
    },
    longestRoadOwner: null,
    longestRoadLength: 0,
    metropolisOwner: { science: null, trade: null, politics: null },
    lastRoll: null,
    setupQueue: [...playerOrder],
    setupLastPlacedVertex: null,
    pendingDisplace: null,
    pendingProgressDraw: null,
    pendingDiscard: null,
    pendingProgressDiscard: null,
    pendingRollResume: null,
    pendingFreeRoads: null,
    pendingKnightPromotions: null,
    pendingCommercialHarbor: null,
    pendingTreason: null,
    pendingVpCardAnnouncement: null,
    pendingScienceBonus: null,
    pendingTradeOffer: null,
    pendingBarbarian: null,
    knightsActivatedThisTurn: [],
    progressEffects: {
      craneDiscountPlayerId: null,
      merchantFleet: null,
    },
    winner: null,
    log: [],
  };
}

// ─── computeVP ────────────────────────────────────────────────────────────────

export function computeVP(state: GameState, playerId: PlayerId): number {
  let vp = 0;
  const player = state.players[playerId];
  if (!player) return 0;

  // Buildings on board
  for (const building of Object.values(state.board.vertices)) {
    if (!building || building.playerId !== playerId) continue;
    if (building.type === "settlement") {
      vp += 1;
    } else if (building.type === "city") {
      vp += building.metropolis ? 4 : 2;
    }
  }

  // Special cards
  if (state.longestRoadOwner === playerId) vp += 2;

  // VP tokens (from barbarian defense)
  vp += player.vpTokens;

  // VP progress cards (face-up, already counted separately)
  vp += player.progressCards.filter((c) => c.isVP).length;

  // Merchant
  if (state.board.merchantOwner === playerId) vp += 1;

  return vp;
}

// ─── applyAction ──────────────────────────────────────────────────────────────

export function applyAction(state: GameState, action: GameAction): GameState {
  let s = { ...state, version: state.version + 1 };
  const graph = buildGraph();

  switch (action.type) {
    // ── Setup ──────────────────────────────────────────────────────────────────
    case "PLACE_BUILDING": {
      const { pid, vid, building } = action;
      const b =
        building === "settlement"
          ? { type: "settlement" as const, playerId: pid }
          : {
              type: "city" as const,
              playerId: pid,
              hasWall: false,
              metropolis: null,
            };

      s = {
        ...s,
        board: { ...s.board, vertices: { ...s.board.vertices, [vid]: b } },
      };

      // In SETUP_R2_CITY: grant starting resources (1 per adjacent hex)
      if (s.phase === "SETUP_R2_CITY" && building === "city") {
        const adjacentHexIds = graph.hexesOfVertex[vid] ?? [];
        const gained: Partial<Resources> = {};
        for (const hid of adjacentHexIds) {
          const hex = s.board.hexes[hid];
          if (!hex || hex.terrain === "desert") continue;
          const resourceType = terrainToResource(hex.terrain);
          if (resourceType) {
            gained[resourceType] = (gained[resourceType] ?? 0) + 1;
          }
        }
        s = {
          ...s,
          players: {
            ...s.players,
            [pid]: {
              ...s.players[pid]!,
              resources: addResources(s.players[pid]!.resources, gained),
            },
          },
        };
      }

      // Advance to road placement
      s = {
        ...s,
        phase:
          s.phase === "SETUP_R1_SETTLEMENT" ? "SETUP_R1_ROAD" : "SETUP_R2_ROAD",
        setupLastPlacedVertex: vid,
      };
      return s;
    }

    case "PLACE_ROAD": {
      const { pid, eid } = action;
      s = {
        ...s,
        board: {
          ...s.board,
          edges: { ...s.board.edges, [eid]: { playerId: pid } },
        },
        setupLastPlacedVertex: null,
      };

      // Advance setup queue
      const isR1 = s.phase === "SETUP_R1_ROAD";
      const isR2 = s.phase === "SETUP_R2_ROAD";
      const queue = [...s.setupQueue];
      queue.shift(); // remove current player

      if (isR1) {
        if (queue.length === 0) {
          // R1 done → start R2 in REVERSE order
          const r2Queue = [...s.playerOrder].reverse();
          s = {
            ...s,
            setupQueue: r2Queue,
            currentPlayerId: r2Queue[0]!,
            phase: "SETUP_R2_CITY",
          };
        } else {
          s = {
            ...s,
            setupQueue: queue,
            currentPlayerId: queue[0]!,
            phase: "SETUP_R1_SETTLEMENT",
          };
        }
      } else if (isR2) {
        if (queue.length === 0) {
          // Setup complete → first player rolls
          s = {
            ...s,
            setupQueue: [],
            currentPlayerId: s.playerOrder[0]!,
            phase: "ROLL_DICE",
          };
        } else {
          s = {
            ...s,
            setupQueue: queue,
            currentPlayerId: queue[0]!,
            phase: "SETUP_R2_CITY",
          };
        }
      }

      return s;
    }

    // ── Roll Dice ──────────────────────────────────────────────────────────────
    case "ROLL_DICE": {
      const { pid } = action;
      let [d1, d2, event] = action.result ?? [
        rollProductionDie(),
        rollProductionDie(),
        rollEventDie(),
      ];
      const yellowDie = d1;
      const redDie = d2;
      const production = yellowDie + redDie;

      s = { ...s, lastRoll: [d1, d2, event] };
      s = log(
        s,
        `${s.players[pid]?.name} rolled ${logDieToken("yellow", yellowDie)} ${logDieToken("red", redDie)} = ${production} ${logEventDieToken(event)}`,
      );

      // 1. Handle event die
      if (event === "ship") {
        const newPos = s.barbarian.position + 1;
        if (newPos >= 7) {
          // Barbarians land: park state in RESOLVE_BARBARIANS with a pre-computed
          // outcome so the client-side cinematic can reveal it. The actual state
          // mutation (VP, pillage, knights, robber) waits for EXECUTE_BARBARIAN_ATTACK.
          s = { ...s, barbarian: { ...s.barbarian, position: 7 } };
          const pendingBarbarian = computeBarbarianAttack(s);
          s = log(
            s,
            `Barbarians approach the island! Strength ${pendingBarbarian.barbarianStrength} vs Defense ${pendingBarbarian.totalDefense}`,
          );
          return {
            ...s,
            phase: "RESOLVE_BARBARIANS",
            pendingBarbarian,
            // Stash the roll so production/progress-draw can resume after the commit.
            pendingRollResume: { rollerPid: pid, production },
          };
        } else {
          s = { ...s, barbarian: { ...s.barbarian, position: newPos } };
        }
      } else {
        // Progress card draw opportunity for players with matching track level
        const track = event as ImprovementTrack;
        const drawPlayers = s.playerOrder.filter((p) => {
          const level = s.players[p]?.improvements[track] ?? 0;
          const maxRoll = DRAW_MAX[level] ?? 0;
          return level > 0 && redDie <= maxRoll;
        });
        if (drawPlayers.length > 0) {
          s = { ...s, pendingProgressDraw: { remaining: drawPlayers, track } };
        }
      }

      // 2. Handle production
      const needProgDiscard = pendingProgressDiscardNeeds(s);
      if (Object.keys(needProgDiscard).length > 0) {
        s = {
          ...s,
          phase: "DISCARD_PROGRESS",
          pendingProgressDiscard: { remaining: needProgDiscard },
          pendingRollResume: { rollerPid: pid, production },
        };
        return checkWin(s);
      }

      s = applyProductionAfterRoll(s, graph, pid, production);
      return checkWin(s);
    }

    // ── Commit Barbarian Attack ────────────────────────────────────────────────
    case "EXECUTE_BARBARIAN_ATTACK": {
      if (s.phase !== "RESOLVE_BARBARIANS" || !s.pendingBarbarian) return s;
      s = commitBarbarianAttack(s, s.pendingBarbarian);
      s = { ...s, pendingBarbarian: null };

      // Game could have ended during commit (VP token could land someone at 13)
      if (s.phase === "GAME_OVER") return s;

      // Tie-draw can add progress cards before production; enforce the 4-card limit
      // (same ordering as ROLL_DICE before applyProductionAfterRoll).
      const needProgDiscardAfterCommit = pendingProgressDiscardNeeds(s);
      if (Object.keys(needProgDiscardAfterCommit).length > 0) {
        return checkWin({
          ...s,
          phase: "DISCARD_PROGRESS",
          pendingProgressDiscard: { remaining: needProgDiscardAfterCommit },
        });
      }

      // Resume the interrupted roll — reuse the exact same path the progress-discard
      // resume takes after DISCARD_PROGRESS finishes.
      const resume = s.pendingRollResume;
      if (!resume) {
        // No roll to resume (e.g. admin-triggered attack); land back in ACTION.
        return { ...s, phase: "ACTION" };
      }
      s = { ...s, pendingRollResume: null };
      s = applyProductionAfterRoll(s, graph, resume.rollerPid, resume.production);
      return checkWin(s);
    }

    // ── Discard ────────────────────────────────────────────────────────────────
    case "DISCARD": {
      const { pid, cards } = action;
      const player = s.players[pid]!;
      const discardedCount = Object.values(cards).reduce(
        (sum, v) => sum + (v ?? 0),
        0,
      );
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...player,
            resources: subtractResources(player.resources, cards),
          },
        },
      };
      s = log(
        s,
        appendLogTokens(
          `${s.players[pid]?.name} discarded ${discardedCount} resource card${discardedCount === 1 ? "" : "s"}.`,
          logResourceDeltaTokens(cards, -1),
        ),
      );

      const pending = { ...s.pendingDiscard! };
      const newRemaining = { ...pending.remaining };
      delete newRemaining[pid];

      if (Object.keys(newRemaining).length === 0) {
        // All discards done
        s = { ...s, pendingDiscard: null };
        if (s.barbarian.robberActive) {
          s = { ...s, phase: "ROBBER_MOVE" };
        } else {
          s = { ...s, phase: "ACTION" };
        }
      } else {
        s = { ...s, pendingDiscard: { remaining: newRemaining } };
      }
      return s;
    }

    // ── Move Robber ────────────────────────────────────────────────────────────
    case "MOVE_ROBBER": {
      const { pid, hid, stealFrom } = action;

      // Clear old robber
      const hexes = Object.fromEntries(
        Object.entries(s.board.hexes).map(([k, v]) => [
          k,
          { ...v, hasRobber: false },
        ]),
      );
      hexes[hid] = { ...hexes[hid]!, hasRobber: true };

      s = { ...s, board: { ...s.board, hexes } };

      // Steal a card
      if (stealFrom) {
        s = stealRandomCard(s, pid, stealFrom);
      }

      s = log(
        s,
        stealFrom
          ? `${s.players[pid]?.name} moved the robber and stole a card from ${s.players[stealFrom]?.name}.`
          : `${s.players[pid]?.name} moved the robber.`,
      );

      s = { ...s, phase: "ACTION" };
      return s;
    }

    // ── Build ──────────────────────────────────────────────────────────────────
    case "BUILD_ROAD": {
      const { pid, eid } = action;
      const player = s.players[pid]!;
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...player,
            resources: subtractResources(player.resources, BUILD_COSTS.road),
            supply: { ...player.supply, roads: player.supply.roads - 1 },
          },
        },
        board: {
          ...s.board,
          edges: { ...s.board.edges, [eid]: { playerId: pid } },
        },
      };
      s = updateLongestRoad(s);
      s = log(
        s,
        appendLogTokens(
          `${s.players[pid]?.name} built a road.`,
          resourceCostTokens(BUILD_COSTS.road),
        ),
      );
      return s;
    }

    case "BUILD_SETTLEMENT": {
      const { pid, vid } = action;
      const player = s.players[pid]!;
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...player,
            resources: subtractResources(
              player.resources,
              BUILD_COSTS.settlement,
            ),
            supply: {
              ...player.supply,
              settlements: player.supply.settlements - 1,
            },
          },
        },
        board: {
          ...s.board,
          vertices: {
            ...s.board.vertices,
            [vid]: { type: "settlement", playerId: pid },
          },
        },
      };
      s = log(
        s,
        appendLogTokens(
          `${s.players[pid]?.name} built a settlement.`,
          resourceCostTokens(BUILD_COSTS.settlement),
        ),
      );
      return checkWin(s);
    }

    case "BUILD_CITY": {
      const { pid, vid } = action;
      const player = s.players[pid]!;
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...player,
            resources: subtractResources(player.resources, BUILD_COSTS.city),
            supply: {
              ...player.supply,
              settlements: player.supply.settlements + 1,
              cities: player.supply.cities - 1,
            },
          },
        },
        board: {
          ...s.board,
          vertices: {
            ...s.board.vertices,
            [vid]: {
              type: "city",
              playerId: pid,
              hasWall: false,
              metropolis: null,
            },
          },
        },
      };
      s = log(
        s,
        appendLogTokens(
          `${s.players[pid]?.name} built a city.`,
          resourceCostTokens(BUILD_COSTS.city),
        ),
      );
      return checkWin(s);
    }

    case "BUILD_CITY_WALL": {
      const { pid, vid } = action;
      const player = s.players[pid]!;
      const city = s.board.vertices[vid] as {
        type: "city";
        playerId: PlayerId;
        hasWall: boolean;
        metropolis: ImprovementTrack | null;
      };
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...player,
            resources: subtractResources(
              player.resources,
              BUILD_COSTS.cityWall,
            ),
            supply: {
              ...player.supply,
              cityWalls: player.supply.cityWalls - 1,
            },
          },
        },
        board: {
          ...s.board,
          vertices: { ...s.board.vertices, [vid]: { ...city, hasWall: true } },
        },
      };
      s = log(
        s,
        appendLogTokens(
          `${s.players[pid]?.name} built a city wall.`,
          resourceCostTokens(BUILD_COSTS.cityWall),
        ),
      );
      return s;
    }

    case "IMPROVE_CITY": {
      const { pid, track } = action;
      const player = s.players[pid]!;
      const currentLevel = player.improvements[track];
      const targetLevel = currentLevel + 1;
      const commodity = TRACK_COMMODITY[track];
      const craneDiscount =
        s.progressEffects.craneDiscountPlayerId === pid ? 1 : 0;
      const cost = Math.max(0, targetLevel - craneDiscount);

      const newImprovements = { ...player.improvements, [track]: targetLevel };
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...player,
            resources: subtractResources(player.resources, {
              [commodity]: cost,
            } as Partial<Resources>),
            improvements: newImprovements,
          },
        },
        progressEffects:
          craneDiscount > 0
            ? {
                ...s.progressEffects,
                craneDiscountPlayerId: null,
              }
            : s.progressEffects,
      };

      // Check metropolis thresholds
      s = checkMetropolis(s, pid, track, targetLevel);
      s = log(
        s,
        appendLogTokens(
          `${s.players[pid]?.name} improved ${track} to level ${targetLevel}.`,
          logResourceDeltaTokens(
            { [TRACK_COMMODITY[track]]: cost } as Partial<Resources>,
            -1,
          ),
        ),
      );
      return checkWin(s);
    }

    // ── Knights ────────────────────────────────────────────────────────────────
    case "RECRUIT_KNIGHT": {
      const { pid, vid } = action;
      const player = s.players[pid]!;
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...player,
            resources: subtractResources(
              player.resources,
              BUILD_COSTS.knightRecruit,
            ),
            supply: {
              ...player.supply,
              knights: {
                ...player.supply.knights,
                1: player.supply.knights[1] - 1,
              },
            },
          },
        },
        board: {
          ...s.board,
          knights: {
            ...s.board.knights,
            [vid]: { playerId: pid, strength: 1, active: false },
          },
        },
      };
      s = log(
        s,
        appendLogTokens(
          `${s.players[pid]?.name} recruited a knight.`,
          resourceCostTokens(BUILD_COSTS.knightRecruit),
        ),
      );
      return s;
    }

    case "PROMOTE_KNIGHT": {
      const { pid, vid } = action;
      const player = s.players[pid]!;
      const knight = s.board.knights[vid]!;
      const newStrength = (knight.strength + 1) as KnightStrength;
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...player,
            resources: subtractResources(
              player.resources,
              BUILD_COSTS.knightPromote,
            ),
            supply: {
              ...player.supply,
              knights: {
                ...player.supply.knights,
                [knight.strength]: player.supply.knights[knight.strength] + 1,
                [newStrength]: player.supply.knights[newStrength] - 1,
              },
            },
          },
        },
        board: {
          ...s.board,
          knights: {
            ...s.board.knights,
            [vid]: { ...knight, strength: newStrength },
          },
        },
      };
      s = log(
        s,
        appendLogTokens(
          `${s.players[pid]?.name} promoted a knight.`,
          resourceCostTokens(BUILD_COSTS.knightPromote),
        ),
      );
      return s;
    }

    case "ACTIVATE_KNIGHT": {
      const { pid, vid } = action;
      const player = s.players[pid]!;
      const knight = s.board.knights[vid]!;
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...player,
            resources: subtractResources(
              player.resources,
              BUILD_COSTS.knightActivate,
            ),
          },
        },
        board: {
          ...s.board,
          knights: { ...s.board.knights, [vid]: { ...knight, active: true } },
        },
        knightsActivatedThisTurn: s.knightsActivatedThisTurn.includes(vid)
          ? s.knightsActivatedThisTurn
          : [...s.knightsActivatedThisTurn, vid],
      };
      s = log(
        s,
        appendLogTokens(
          `${s.players[pid]?.name} activated a knight.`,
          resourceCostTokens(BUILD_COSTS.knightActivate),
        ),
      );
      return s;
    }

    case "MOVE_KNIGHT": {
      const { from, to } = action;
      if (s.knightsActivatedThisTurn.includes(from)) return s;
      const knight = s.board.knights[from]!;
      s = {
        ...s,
        board: {
          ...s.board,
          knights: {
            ...s.board.knights,
            [from]: null,
            [to]: { ...knight, active: false },
          },
        },
      };
      s = updateLongestRoad(s); // knight movement may affect road traversal
      return s;
    }

    case "DISPLACE_KNIGHT": {
      const { pid, from, target } = action;
      if (s.knightsActivatedThisTurn.includes(from)) return s;
      const myKnight = s.board.knights[from]!;
      const theirKnight = s.board.knights[target]!;

      s = {
        ...s,
        board: {
          ...s.board,
          knights: {
            ...s.board.knights,
            [from]: null,
            [target]: { ...myKnight, active: false },
          },
        },
        pendingDisplace: {
          displacerPlayerId: pid,
          displacedPlayerId: theirKnight.playerId,
          displacedKnightVertex: target,
          displacedKnightStrength: theirKnight.strength,
        },
        phase: "KNIGHT_DISPLACE_RESPONSE",
      };
      return s;
    }

    case "DISPLACED_MOVE": {
      const { pid, to } = action;
      const pending = s.pendingDisplace!;

      if (to === null) {
        // Can't move — knight returned to supply
        const player = s.players[pid]!;
        s = {
          ...s,
          players: {
            ...s.players,
            [pid]: {
              ...player,
              supply: {
                ...player.supply,
                knights: {
                  ...player.supply.knights,
                  [pending.displacedKnightStrength]:
                    player.supply.knights[pending.displacedKnightStrength] + 1,
                },
              },
            },
          },
        };
      } else {
        s = {
          ...s,
          board: {
            ...s.board,
            knights: {
              ...s.board.knights,
              [to]: {
                playerId: pid,
                strength: pending.displacedKnightStrength,
                active: false,
              },
            },
          },
        };
      }
      s = { ...s, pendingDisplace: null, phase: "ACTION" };
      return s;
    }

    case "CHASE_ROBBER": {
      const { pid, knight, hid, stealFrom } = action;
      if (s.phase !== "ACTION" || s.currentPlayerId !== pid) return s;
      if (s.knightsActivatedThisTurn.includes(knight)) return s;
      const knightPiece = s.board.knights[knight];
      if (!knightPiece || knightPiece.playerId !== pid || !knightPiece.active)
        return s;
      if (!s.barbarian.robberActive) return s;
      // Deactivate knight
      s = {
        ...s,
        board: {
          ...s.board,
          knights: {
            ...s.board.knights,
            [knight]: { ...knightPiece, active: false },
          },
        },
      };
      // Move robber
      const hexes = Object.fromEntries(
        Object.entries(s.board.hexes).map(([k, v]) => [
          k,
          { ...v, hasRobber: false },
        ]),
      );
      hexes[hid] = { ...hexes[hid]!, hasRobber: true };
      s = { ...s, board: { ...s.board, hexes } };
      if (stealFrom) s = stealRandomCard(s, pid, stealFrom);
      return s;
    }

    // ── Progress Cards ─────────────────────────────────────────────────────────
    case "DRAW_PROGRESS": {
      const { pid, track } = action;
      if (s.phase !== "RESOLVE_PROGRESS_DRAW") return s;
      const ppd = s.pendingProgressDraw;
      if (!ppd || !ppd.remaining.includes(pid) || ppd.track !== track) return s;
      const deck = [...s.decks[track]];
      if (deck.length === 0) return s;
      const card = deck.shift()!;
      const player = s.players[pid]!;

      s = {
        ...s,
        decks: { ...s.decks, [track]: deck },
        players: {
          ...s.players,
          [pid]: { ...player, progressCards: [...player.progressCards, card] },
        },
        ...(card.isVP ? { pendingVpCardAnnouncement: { pid, card } } : {}),
      };
      s = log(s, `${s.players[pid]?.name} drew a ${track} progress card.`);

      s = advanceProgressDrawAfterDraw(s, pid);
      return checkWin(s);
    }

    case "DISCARD_PROGRESS": {
      const { pid, cards } = action;
      const ppd = s.pendingProgressDiscard;
      if (s.phase !== "DISCARD_PROGRESS" || !ppd) return s;
      const owedBefore = ppd.remaining[pid];
      if (owedBefore === undefined) return s;
      if (cards.length < 1 || cards.length > owedBefore) return s;
      if (cards.some((c) => c.isVP)) return s;
      const player = s.players[pid]!;
      const newHand = tryRemoveProgressCardsFromHand(player.progressCards, cards);
      if (!newHand) return s;
      const updated: Player = { ...player, progressCards: newHand };
      const stillOver = progressDiscardCount(updated);

      s = {
        ...s,
        players: { ...s.players, [pid]: updated },
      };
      s = log(
        s,
        `${s.players[pid]?.name} discarded ${cards.length} progress card${cards.length === 1 ? "" : "s"}.`,
      );

      const rem = { ...ppd.remaining };
      if (stillOver > 0) {
        rem[pid] = stillOver;
      } else {
        delete rem[pid];
      }
      if (Object.keys(rem).length > 0) {
        s = { ...s, pendingProgressDiscard: { remaining: rem } };
        return checkWin(s);
      }

      s = { ...s, pendingProgressDiscard: null };
      const resume = s.pendingRollResume;
      if (resume) {
        s = { ...s, pendingRollResume: null };
        s = applyProductionAfterRoll(s, graph, resume.rollerPid, resume.production);
        return checkWin(s);
      }

      s = { ...s, phase: "ACTION" };
      return checkWin(s);
    }

    case "PLAY_PROGRESS": {
      return applyProgressCard(s, action.pid, action.card, action.params);
    }

    // ── Progress multi-step actions ───────────────────────────────────────────
    case "PROGRESS_PLACE_FREE_ROAD": {
      const { pid, eid } = action;
      const pending = s.pendingFreeRoads;
      if (!pending || pending.pid !== pid) return s;
      if (s.players[pid]!.supply.roads <= 0) return s;
      if (s.board.edges[eid] !== null) return s;
      const player = s.players[pid]!;
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...player,
            supply: { ...player.supply, roads: player.supply.roads - 1 },
          },
        },
        board: {
          ...s.board,
          edges: { ...s.board.edges, [eid]: { playerId: pid } },
        },
      };
      s = updateLongestRoad(s);
      const roadsLeft = (pending.remaining - 1) as 0 | 1 | 2;
      if (roadsLeft <= 0 || s.players[pid]!.supply.roads <= 0) {
        s = { ...s, pendingFreeRoads: null };
      } else {
        s = { ...s, pendingFreeRoads: { pid, remaining: roadsLeft as 1 | 2 } };
      }
      return s;
    }

    case "PROGRESS_SKIP_FREE_ROADS": {
      const { pid } = action;
      if (s.pendingFreeRoads?.pid !== pid) return s;
      return { ...s, pendingFreeRoads: null };
    }

    case "PROGRESS_PROMOTE_FREE_KNIGHT": {
      const { pid, vid } = action;
      const pending = s.pendingKnightPromotions;
      if (!pending || pending.pid !== pid) return s;
      const knight = s.board.knights[vid];
      if (!knight || knight.playerId !== pid) return s;
      if (knight.strength >= 3) return s;
      if (knight.strength === 2 && s.players[pid]!.improvements.politics < 3)
        return s;
      const newStrength = (knight.strength + 1) as KnightStrength;
      if (s.players[pid]!.supply.knights[newStrength] <= 0) return s;
      const player = s.players[pid]!;
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...player,
            supply: {
              ...player.supply,
              knights: {
                ...player.supply.knights,
                [knight.strength]: player.supply.knights[knight.strength] + 1,
                [newStrength]: player.supply.knights[newStrength] - 1,
              },
            },
          },
        },
        board: {
          ...s.board,
          knights: {
            ...s.board.knights,
            [vid]: { ...knight, strength: newStrength },
          },
        },
      };
      const promsLeft = (pending.remaining - 1) as 0 | 1 | 2;
      if (promsLeft <= 0) {
        s = { ...s, pendingKnightPromotions: null };
      } else {
        s = {
          ...s,
          pendingKnightPromotions: { pid, remaining: promsLeft as 1 | 2 },
        };
      }
      return s;
    }

    case "PROGRESS_SKIP_FREE_PROMOTIONS": {
      const { pid } = action;
      if (s.pendingKnightPromotions?.pid !== pid) return s;
      return { ...s, pendingKnightPromotions: null };
    }

    case "PROGRESS_PLACE_TREASON_KNIGHT": {
      const { pid, vid, strength } = action;
      const pending = s.pendingTreason;
      if (!pending || pending.pid !== pid) return s;
      if (strength > pending.maxStrength) return s;
      const me = s.players[pid]!;
      if ((me.supply.knights[strength] ?? 0) <= 0) return s;
      if (
        s.board.vertices[vid] ||
        s.board.knights[vid] ||
        !isOnPlayerNetwork(s.board, graph, pid, vid)
      )
        return s;
      return {
        ...s,
        pendingTreason: null,
        players: {
          ...s.players,
          [pid]: {
            ...me,
            supply: {
              ...me.supply,
              knights: {
                ...me.supply.knights,
                [strength]: me.supply.knights[strength] - 1,
              },
            },
          },
        },
        board: {
          ...s.board,
          knights: {
            ...s.board.knights,
            [vid]: { playerId: pid, strength, active: pending.active },
          },
        },
      };
    }

    case "PROGRESS_SKIP_TREASON": {
      const { pid } = action;
      if (s.pendingTreason?.pid !== pid) return s;
      return { ...s, pendingTreason: null };
    }

    case "ACKNOWLEDGE_VP_CARD": {
      const { pid } = action;
      if (s.pendingVpCardAnnouncement?.pid !== pid) return s;
      return { ...s, pendingVpCardAnnouncement: null };
    }


    case "PROGRESS_RESPOND_COMMERCIAL_HARBOR": {
      const { pid, commodity } = action;
      const pending = s.pendingCommercialHarbor;
      if (!pending || !pending.remainingPids.includes(pid)) return s;
      const initiatorPid = pending.initiatorPid;
      const resource = pending.offeredResource;
      const responder = s.players[pid]!;
      const hasCommodity = (["cloth", "coin", "paper"] as const).some(
        (c) => (responder.resources[c] ?? 0) >= 1,
      );
      // Players must give a commodity if they have one — decline only allowed when empty-handed
      if (!commodity && hasCommodity) return s;
      if (commodity) {
        const initiator = s.players[initiatorPid]!;
        if ((responder.resources[commodity] ?? 0) < 1) return s;
        const responderRemove: Partial<
          CommodityType extends keyof Resources
            ? Record<CommodityType, number>
            : Record<string, number>
        > = {
          [commodity]: 1,
        } as Partial<Resources>;
        const responderAdd: Partial<
          ResourceType extends keyof Resources
            ? Record<ResourceType, number>
            : Record<string, number>
        > = {
          [resource]: 1,
        } as Partial<Resources>;
        const initiatorRemove: Partial<
          ResourceType extends keyof Resources
            ? Record<ResourceType, number>
            : Record<string, number>
        > = {
          [resource]: 1,
        } as Partial<Resources>;
        const initiatorAdd: Partial<
          CommodityType extends keyof Resources
            ? Record<CommodityType, number>
            : Record<string, number>
        > = {
          [commodity]: 1,
        } as Partial<Resources>;
        s = {
          ...s,
          players: {
            ...s.players,
            [pid]: {
              ...responder,
              resources: addResources(
                subtractResources(
                  responder.resources,
                  responderRemove as Partial<Resources>,
                ),
                responderAdd as Partial<Resources>,
              ),
            },
            [initiatorPid]: {
              ...initiator,
              resources: addResources(
                subtractResources(
                  initiator.resources,
                  initiatorRemove as Partial<Resources>,
                ),
                initiatorAdd as Partial<Resources>,
              ),
            },
          },
        };
      }
      const newRemaining = pending.remainingPids.filter((p) => p !== pid);
      s = {
        ...s,
        pendingCommercialHarbor:
          newRemaining.length > 0
            ? { ...pending, remainingPids: newRemaining }
            : null,
      };
      return s;
    }

    // ── Trading ────────────────────────────────────────────────────────────────
    case "SELECT_SCIENCE_RESOURCE": {
      const { pid, resource } = action;
      if (s.phase !== "SCIENCE_SELECT_RESOURCE") return s;
      if (s.pendingScienceBonus?.pid !== pid) return s;
      // Only basic resources (not commodities)
      const basicResources = new Set<keyof Resources>([
        "brick",
        "lumber",
        "ore",
        "grain",
        "wool",
      ]);
      if (!basicResources.has(resource)) return s;
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...s.players[pid]!,
            resources: addResources(s.players[pid]!.resources, {
              [resource]: 1,
            }),
          },
        },
        pendingScienceBonus: null,
      };
      s = log(
        s,
        `${s.players[pid]?.name} took 1 ${resource} (Science level 3 ability).`,
      );
      // Transition: progress draw first if pending, else action
      if (s.pendingProgressDraw && s.pendingProgressDraw.remaining.length > 0) {
        s = { ...s, phase: "RESOLVE_PROGRESS_DRAW" };
      } else {
        s = { ...s, phase: "ACTION" };
      }
      return s;
    }

    case "TRADE_BANK": {
      const { pid, give, get } = action;
      const player = s.players[pid]!;
      // Validate trade legality (includes trade L3 commodity 2:1 and MerchantFleet)
      if (!canTradeBank(player, s.board, give, get, s.progressEffects))
        return s;
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...player,
            resources: addResources(
              subtractResources(player.resources, give),
              get,
            ),
          },
        },
      };
      const tradeDetails = tradeDetailsText(give, get);
      s = log(
        s,
        appendLogTokens(
          `${s.players[pid]?.name} traded with the bank.`,
          tradeDetails.length > 0 ? tradeDetails.split(" ") : [],
        ),
      );
      return s;
    }

    case "TRADE_OFFER": {
      const { from, to, offer, want } = action;
      if (s.phase !== "ACTION" || s.currentPlayerId !== from) return s;
      if (s.pendingTradeOffer) return s;
      if (!Object.values(offer).some((v) => (v ?? 0) > 0)) return s;
      if (!Object.values(want).some((v) => (v ?? 0) > 0)) return s;
      // Deduplicate, remove self, validate all targets exist
      const targetPids = [...new Set(to)].filter(
        (pid) => pid !== from && s.players[pid],
      );
      if (targetPids.length === 0) return s;
      for (const [k, v] of Object.entries(offer)) {
        if (
          (s.players[from]!.resources[k as keyof Resources] ?? 0) < (v ?? 0)
        )
          return s;
      }
      s = {
        ...s,
        pendingTradeOffer: { initiatorPid: from, targetPids, offer, want },
      };
      const targetNames = targetPids.map((p) => s.players[p]?.name).join(", ");
      s = log(s, `${s.players[from]?.name} offered a trade to ${targetNames}.`);
      return s;
    }

    case "TRADE_ACCEPT": {
      const { from, to } = action;
      const pending = s.pendingTradeOffer;
      if (!pending || pending.initiatorPid !== from || !pending.targetPids.includes(to))
        return s;
      const initiator = s.players[from]!;
      const responder = s.players[to]!;
      for (const [k, v] of Object.entries(pending.want)) {
        if (
          (responder.resources[k as keyof Resources] ?? 0) < (v ?? 0)
        )
          return s;
      }
      s = {
        ...s,
        players: {
          ...s.players,
          [from]: {
            ...initiator,
            resources: addResources(
              subtractResources(initiator.resources, pending.offer),
              pending.want,
            ),
          },
          [to]: {
            ...responder,
            resources: addResources(
              subtractResources(responder.resources, pending.want),
              pending.offer,
            ),
          },
        },
        pendingTradeOffer: null,
      };
      const tradeDetails = tradeDetailsText(pending.offer, pending.want);
      s = log(
        s,
        appendLogTokens(
          `${s.players[from]?.name} and ${s.players[to]?.name} made a deal.`,
          tradeDetails.length > 0 ? tradeDetails.split(" ") : [],
        ),
      );
      return s;
    }

    case "TRADE_REJECT": {
      const { from, to } = action;
      const pending = s.pendingTradeOffer;
      if (!pending || pending.initiatorPid !== from || !pending.targetPids.includes(to))
        return s;
      const remaining = pending.targetPids.filter((p) => p !== to);
      s = remaining.length > 0
        ? { ...s, pendingTradeOffer: { ...pending, targetPids: remaining } }
        : { ...s, pendingTradeOffer: null };
      s = log(s, `${s.players[to]?.name} declined the trade offer.`);
      return s;
    }

    case "TRADE_CANCEL": {
      const { from } = action;
      const pending = s.pendingTradeOffer;
      if (!pending || pending.initiatorPid !== from) return s;
      s = { ...s, pendingTradeOffer: null };
      s = log(s, `${s.players[from]?.name} cancelled their trade offer.`);
      return s;
    }

    // ── Host Master Controls ─────────────────────────────────────────────────
    case "ADMIN_MOVE_ROAD": {
      const { pid, fromEid, toEid, unsafe = false, reason } = action;
      const source = s.board.edges[fromEid];
      if (!source || source.playerId !== pid) return s;
      if (s.board.edges[toEid] !== null) return s;
      if (!unsafe && !isOnPlayerNetwork(s.board, graph, pid, toEid)) return s;

      s = {
        ...s,
        board: {
          ...s.board,
          edges: {
            ...s.board.edges,
            [fromEid]: null,
            [toEid]: source,
          },
        },
      };
      s = updateLongestRoad(s);
      return log(
        s,
        `[MASTER] ${s.players[pid]?.name} road moved ${fromEid} -> ${toEid}${reason ? ` (${reason})` : ""}`,
      );
    }

    case "ADMIN_MOVE_BUILDING": {
      const { pid, fromVid, toVid, unsafe = false, reason } = action;
      const source = s.board.vertices[fromVid];
      if (!source || source.playerId !== pid) return s;
      if (s.board.vertices[toVid] !== null) return s;
      if (s.board.knights[toVid] !== null) return s;

      if (!unsafe) {
        const adjacent = graph.adjacentVertices[toVid] ?? [];
        const blockedByDistance = adjacent.some(
          (adj: VertexId) => !!s.board.vertices[adj],
        );
        if (blockedByDistance) return s;
      }

      s = {
        ...s,
        board: {
          ...s.board,
          vertices: {
            ...s.board.vertices,
            [fromVid]: null,
            [toVid]: source,
          },
        },
      };
      return log(
        s,
        `[MASTER] ${s.players[pid]?.name} ${source.type} moved ${fromVid} -> ${toVid}${reason ? ` (${reason})` : ""}`,
      );
    }

    case "ADMIN_MOVE_KNIGHT": {
      const { pid, fromVid, toVid, unsafe = false, reason } = action;
      const source = s.board.knights[fromVid];
      if (!source || source.playerId !== pid) return s;
      if (s.board.vertices[toVid] !== null) return s;
      if (s.board.knights[toVid] !== null) return s;
      if (
        !unsafe &&
        !isKnightMoveReachable(s.board, graph, pid, fromVid, toVid)
      ) {
        return s;
      }

      s = {
        ...s,
        board: {
          ...s.board,
          knights: {
            ...s.board.knights,
            [fromVid]: null,
            [toVid]: source,
          },
        },
      };
      s = updateLongestRoad(s);
      return log(
        s,
        `[MASTER] ${s.players[pid]?.name} knight moved ${fromVid} -> ${toVid}${reason ? ` (${reason})` : ""}`,
      );
    }

    case "ADMIN_SWAP_NUMBER_TOKENS": {
      const { hidA, hidB, reason } = action;
      const a = s.board.hexes[hidA];
      const b = s.board.hexes[hidB];
      if (!a || !b) return s;
      if (a.number === null || b.number === null) return s;

      s = {
        ...s,
        board: {
          ...s.board,
          hexes: {
            ...s.board.hexes,
            [hidA]: { ...a, number: b.number },
            [hidB]: { ...b, number: a.number },
          },
        },
      };
      return log(
        s,
        `[MASTER] Number tokens swapped ${hidA} <-> ${hidB}${reason ? ` (${reason})` : ""}`,
      );
    }

    case "ADMIN_SWAP_HEXES": {
      const { hidA, hidB, reason } = action;
      const a = s.board.hexes[hidA];
      const b = s.board.hexes[hidB];
      if (!a || !b) return s;

      s = {
        ...s,
        board: {
          ...s.board,
          hexes: {
            ...s.board.hexes,
            [hidA]: {
              ...a,
              terrain: b.terrain,
              number: b.number,
              hasRobber: b.hasRobber,
            },
            [hidB]: {
              ...b,
              terrain: a.terrain,
              number: a.number,
              hasRobber: a.hasRobber,
            },
          },
        },
      };
      return log(
        s,
        `[MASTER] Hexes swapped ${hidA} <-> ${hidB}${reason ? ` (${reason})` : ""}`,
      );
    }

    case "ADMIN_GRANT_PROGRESS_CARD": {
      const { pid, track, cardName, reason } = action;
      const deck = [...s.decks[track]];
      let idx = 0;
      if (cardName) {
        idx = deck.findIndex((c) => c.name === cardName);
        if (idx === -1) return s;
      }
      const [card] = deck.splice(idx, 1);
      if (!card) return s;

      s = {
        ...s,
        decks: { ...s.decks, [track]: deck },
        players: {
          ...s.players,
          [pid]: {
            ...s.players[pid]!,
            progressCards: [...s.players[pid]!.progressCards, card],
          },
        },
      };
      return log(
        s,
        `[MASTER] ${s.players[pid]?.name} receives ${card.name}${reason ? ` (${reason})` : ""}`,
      );
    }

    case "ADMIN_GRANT_CARDS": {
      const { pid, cards, reason } = action;
      const values = Object.values(cards).filter((n) => (n ?? 0) > 0);
      if (values.length === 0) return s;

      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...s.players[pid]!,
            resources: addResources(s.players[pid]!.resources, cards),
          },
        },
      };

      return log(
        s,
        appendLogTokens(
          `[MASTER] ${s.players[pid]?.name} receives cards${reason ? ` (${reason})` : ""}`,
          logResourceDeltaTokens(cards, 1),
        ),
      );
    }

    case "ADMIN_SET_PLAYER_BOT": {
      const { pid, isBot, reason } = action;
      const player = s.players[pid];
      if (!player || player.isBot === isBot) return s;
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: { ...player, isBot },
        },
      };
      return log(
        s,
        `[MASTER] ${player.name} ${isBot ? "converted to bot" : "restored to human"}${reason ? ` (${reason})` : ""}`,
      );
    }

    case "ADMIN_CLEAR_PENDING_STATE": {
      const { fields, phase, reason } = action;
      if (fields.length === 0 && !phase) return s;

      const next: GameState = { ...s };
      for (const field of fields) {
        next[field] = null;
      }
      if (phase) next.phase = phase;

      const cleared = fields.length > 0 ? fields.join(", ") : "none";
      const phaseText = phase ? `; phase -> ${phase}` : "";
      return log(
        next,
        `[MASTER] Cleared pending state: ${cleared}${phaseText}${reason ? ` (${reason})` : ""}`,
      );
    }

    case "ADMIN_SET_BARBARIAN_PROGRESS": {
      const { position, reason } = action;
      const nextPosition = Math.max(0, Math.min(7, Math.floor(position)));
      if (nextPosition === s.barbarian.position) return s;

      return log(
        {
          ...s,
          barbarian: {
            ...s.barbarian,
            position: nextPosition,
          },
        },
        `[MASTER] Barbarian progress set to ${nextPosition}/7${reason ? ` (${reason})` : ""}`,
      );
    }

    case "ADMIN_END_GAME": {
      return {
        ...s,
        phase: "GAME_OVER",
        winner: action.winner,
        log: [
          ...s.log,
          `[MASTER] Game ended${action.reason ? ` (${action.reason})` : ""}`,
        ],
      };
    }

    case "ADMIN_UNDO_LAST": {
      // Host-managed in network.ts by restoring pre-admin snapshot.
      return s;
    }

    case "END_TURN": {
      const { pid } = action;
      const idx = s.playerOrder.indexOf(pid);
      const nextIdx = (idx + 1) % s.playerOrder.length;
      s = {
        ...s,
        currentPlayerId: s.playerOrder[nextIdx]!,
        phase: "ROLL_DICE",
        knightsActivatedThisTurn: [],
        progressEffects: {
          craneDiscountPlayerId:
            s.progressEffects.craneDiscountPlayerId === pid
              ? null
              : s.progressEffects.craneDiscountPlayerId,
          merchantFleet:
            s.progressEffects.merchantFleet?.playerId === pid
              ? null
              : s.progressEffects.merchantFleet,
        },
      };
      return s;
    }

    default:
      return s;
  }
}

// ─── Resource Distribution ────────────────────────────────────────────────────

function distributeResources(
  state: GameState,
  production: number,
  graph: ReturnType<typeof buildGraph>,
): GameState {
  let s = state;

  // Collect what each player produces
  const gains: Record<PlayerId, Partial<Resources>> = {};
  const supplyUsed: Record<keyof Resources, number> = emptyResources();

  for (const [hid, hex] of Object.entries(s.board.hexes)) {
    if (hex.number !== production) continue;
    if (hex.hasRobber) continue;
    if (hex.terrain === "desert") continue;

    for (const vid of graph.verticesOfHex[hid] ?? []) {
      const building = s.board.vertices[vid];
      if (!building) continue;

      const pid = building.playerId;
      if (!gains[pid]) gains[pid] = {};

      if (building.type === "settlement") {
        const res = terrainToResource(hex.terrain);
        if (res) {
          gains[pid]![res] = (gains[pid]![res] ?? 0) + 1;
          supplyUsed[res] = (supplyUsed[res] ?? 0) + 1;
        }
      } else if (building.type === "city") {
        // City produces based on terrain
        const prod = cityTerrainProduction(hex.terrain);
        if (prod.resource) {
          gains[pid]![prod.resource] =
            (gains[pid]![prod.resource] ?? 0) + prod.resourceCount;
          supplyUsed[prod.resource] =
            (supplyUsed[prod.resource] ?? 0) + prod.resourceCount;
        }
        if (prod.commodity) {
          gains[pid]![prod.commodity] = (gains[pid]![prod.commodity] ?? 0) + 1;
          supplyUsed[prod.commodity] = (supplyUsed[prod.commodity] ?? 0) + 1;
        }
      }
    }
  }

  // Apply (supply shortage: if multiple players compete for same resource and supply runs out, no one gets it)
  // Simplified: apply all gains (in a real game, supply is 19 per resource)
  const newPlayers = { ...s.players };
  for (const [pid, gain] of Object.entries(gains)) {
    const player = newPlayers[pid]!;
    newPlayers[pid] = {
      ...player,
      resources: addResources(player.resources, gain),
    };
  }

  return { ...s, players: newPlayers };
}

function terrainToResource(terrain: string): keyof Resources | null {
  const map: Record<string, keyof Resources> = {
    hills: "brick",
    forest: "lumber",
    mountains: "ore",
    fields: "grain",
    pasture: "wool",
  };
  return map[terrain] ?? null;
}

function cityTerrainProduction(terrain: string): {
  resource: keyof Resources | null;
  resourceCount: number;
  commodity: keyof Resources | null;
} {
  switch (terrain) {
    case "forest":
      return { resource: "lumber", resourceCount: 1, commodity: "paper" };
    case "mountains":
      return { resource: "ore", resourceCount: 1, commodity: "coin" };
    case "pasture":
      return { resource: "wool", resourceCount: 1, commodity: "cloth" };
    case "hills":
      return { resource: "brick", resourceCount: 2, commodity: null };
    case "fields":
      return { resource: "grain", resourceCount: 2, commodity: null };
    default:
      return { resource: null, resourceCount: 0, commodity: null };
  }
}

// ─── Barbarian Attack ─────────────────────────────────────────────────────────

/**
 * Compute what will happen when the barbarians attack, without mutating the state.
 * Returns a deterministic snapshot suitable for driving a client-side cinematic.
 */
export function computeBarbarianAttack(state: GameState): PendingBarbarian {
  // Each city contributes 1 barbarian strength (metropolises included)
  const barbarianStrength = Object.values(state.board.vertices).filter(
    (b) => b?.type === "city",
  ).length;

  // Sum active knight strengths per player
  const defensePerPlayer: Record<PlayerId, number> = {};
  let totalDefense = 0;
  for (const knight of Object.values(state.board.knights)) {
    if (!knight || !knight.active) continue;
    defensePerPlayer[knight.playerId] =
      (defensePerPlayer[knight.playerId] ?? 0) + knight.strength;
    totalDefense += knight.strength;
  }

  let outcome: PendingBarbarian["outcome"];
  let vpWinners: PlayerId[] = [];
  let tiedDefenders: PlayerId[] = [];
  let citiesPillaged: VertexId[] = [];

  if (totalDefense >= barbarianStrength) {
    // Defenders win — sole hero gets VP, tied top defenders each draw a card
    const entries = Object.entries(defensePerPlayer).filter(
      ([, v]) => v > 0,
    ) as Array<[PlayerId, number]>;
    if (entries.length === 0) {
      outcome = "defenders_win";
    } else {
      const maxContrib = Math.max(...entries.map(([, v]) => v));
      const winners = entries
        .filter(([, v]) => v === maxContrib)
        .map(([pid]) => pid);
      if (winners.length === 1) {
        outcome = "defenders_win";
        vpWinners = winners;
      } else {
        outcome = "tie_draw";
        tiedDefenders = winners;
      }
    }
  } else {
    // Barbarians win — pillage lowest-contribution players' non-metropolis cities
    outcome = "barbarians_win";
    const contributions = state.playerOrder.map((pid) => ({
      pid,
      contrib: defensePerPlayer[pid] ?? 0,
    }));
    contributions.sort((a, b) => a.contrib - b.contrib);
    const minContrib = contributions[0]?.contrib ?? 0;
    const lowestTier = contributions
      .filter((c) => c.contrib === minContrib)
      .map((c) => c.pid);

    // Cap pillage count at (barbarianStrength - totalDefense) to preserve
    // existing behavior (one city per lowest-tier player, up to the deficit).
    let pillageBudget = barbarianStrength - totalDefense;
    for (const pid of lowestTier) {
      if (pillageBudget <= 0) break;
      const target = Object.entries(state.board.vertices).find(
        ([vid, b]) =>
          b?.type === "city" &&
          b.playerId === pid &&
          b.metropolis === null &&
          !citiesPillaged.includes(vid as VertexId),
      );
      if (!target) continue;
      citiesPillaged.push(target[0] as VertexId);
      pillageBudget--;
    }
  }

  return {
    barbarianStrength,
    totalDefense,
    defensePerPlayer,
    outcome,
    vpWinners,
    tiedDefenders,
    citiesPillaged,
  };
}

/**
 * Apply a pre-computed barbarian attack outcome to the game state:
 * deactivate all knights, reset the barbarian track, activate the robber on
 * first attack, grant VP tokens / tie-draw progress cards, and pillage cities.
 */
export function commitBarbarianAttack(
  state: GameState,
  pending: PendingBarbarian,
): GameState {
  let s = state;

  // Deactivate all knights; reset track to 0
  const newKnights = Object.fromEntries(
    Object.entries(s.board.knights).map(([k, v]) =>
      v ? [k, { ...v, active: false }] : [k, null],
    ),
  );
  s = {
    ...s,
    board: { ...s.board, knights: newKnights },
    barbarian: { ...s.barbarian, position: 0 },
  };

  // First attack: activate the robber and place it on the desert
  if (!s.barbarian.robberActive) {
    s = { ...s, barbarian: { ...s.barbarian, robberActive: true } };
    const desertHex = Object.values(s.board.hexes).find(
      (h) => h.terrain === "desert",
    );
    if (desertHex) {
      const hexes = Object.fromEntries(
        Object.entries(s.board.hexes).map(([k, v]) => [
          k,
          { ...v, hasRobber: false },
        ]),
      );
      hexes[desertHex.id] = { ...hexes[desertHex.id]!, hasRobber: true };
      s = { ...s, board: { ...s.board, hexes } };
    }
  }

  s = log(
    s,
    `Barbarians attack! Strength: ${pending.barbarianStrength}, Defense: ${pending.totalDefense}`,
  );

  if (pending.outcome === "defenders_win") {
    if (pending.vpWinners.length === 1) {
      const winnerId = pending.vpWinners[0]!;
      s = {
        ...s,
        players: {
          ...s.players,
          [winnerId]: {
            ...s.players[winnerId]!,
            vpTokens: s.players[winnerId]!.vpTokens + 1,
          },
        },
      };
      s = log(
        s,
        `${s.players[winnerId]?.name} got 1 VP token for defending Catan!`,
      );
    }
    s = checkWin(s);
  } else if (pending.outcome === "tie_draw") {
    s = log(s, "Tied defenders each drew a progress card!");
    for (const winnerId of pending.tiedDefenders) {
      const before = s.players[winnerId]!.progressCards.length;
      s = drawRandomProgressCard(s, winnerId);
      if (s.players[winnerId]!.progressCards.length > before) {
        s = log(s, `${s.players[winnerId]?.name} drew a progress card.`);
      }
    }
    s = checkWin(s);
  } else {
    // barbarians_win: pillage each city in the pre-computed list
    for (const cityVid of pending.citiesPillaged) {
      const cityBuilding = s.board.vertices[cityVid];
      if (cityBuilding?.type !== "city") continue; // defensive: city may have changed state
      const pid = cityBuilding.playerId;
      s = {
        ...s,
        board: {
          ...s.board,
          vertices: {
            ...s.board.vertices,
            [cityVid]: { type: "settlement", playerId: pid },
          },
        },
        players: {
          ...s.players,
          [pid]: {
            ...s.players[pid]!,
            supply: {
              ...s.players[pid]!.supply,
              settlements: s.players[pid]!.supply.settlements - 1,
              cities: s.players[pid]!.supply.cities + 1,
              cityWalls: cityBuilding.hasWall
                ? s.players[pid]!.supply.cityWalls + 1
                : s.players[pid]!.supply.cityWalls,
            },
          },
        },
      };
      s = log(s, `${s.players[pid]?.name}'s city was pillaged!`);
    }
  }

  return s;
}

// ─── Metropolis ───────────────────────────────────────────────────────────────

function checkMetropolis(
  state: GameState,
  pid: PlayerId,
  track: ImprovementTrack,
  level: number,
): GameState {
  let s = state;
  if (level < 4) return s;

  const currentOwner = s.metropolisOwner[track];

  // If no owner or we beat level 4 (permanent ownership at 5)
  const ownerLevel = currentOwner
    ? (s.players[currentOwner]?.improvements[track] ?? 0)
    : 0;

  if (!currentOwner || level > ownerLevel) {
    // Transfer metropolis
    s = { ...s, metropolisOwner: { ...s.metropolisOwner, [track]: pid } };

    // Update vertices: remove metropolis from old owner, add to a city of new owner
    let newVertices = { ...s.board.vertices };

    // Remove old metropolis
    if (currentOwner) {
      for (const [vid, b] of Object.entries(newVertices)) {
        if (b?.type === "city" && b.metropolis === track) {
          newVertices[vid as VertexId] = { ...b, metropolis: null };
          break;
        }
      }
    }

    // Add metropolis to new owner's city
    for (const [vid, b] of Object.entries(newVertices)) {
      if (b?.type === "city" && b.playerId === pid && b.metropolis === null) {
        newVertices[vid as VertexId] = { ...b, metropolis: track };
        break;
      }
    }

    s = { ...s, board: { ...s.board, vertices: newVertices } };
    s = log(s, `${s.players[pid]?.name} claimed the ${track} metropolis!`);
  }

  return s;
}

// ─── Longest Road ─────────────────────────────────────────────────────────────

function updateLongestRoad(state: GameState): GameState {
  const graph = buildGraph();
  let s = state;

  // Seed bestLen with the current owner's road length so they keep the award on ties —
  // challengers must strictly exceed the owner's count to take it.
  const ownerLen = s.longestRoadOwner
    ? computeLongestRoad(s.board, graph, s.longestRoadOwner)
    : 0;
  let bestLen = Math.max(4, ownerLen); // must be at least 5 to claim initially
  let bestOwner: PlayerId | null = null;

  for (const pid of s.playerOrder) {
    if (pid === s.longestRoadOwner) continue; // owner already set the baseline
    const len = computeLongestRoad(s.board, graph, pid);
    if (len >= 5 && len > bestLen) {
      bestLen = len;
      bestOwner = pid;
    }
  }

  if (bestOwner) {
    // A challenger strictly exceeded the current owner — transfer the award
    s = { ...s, longestRoadOwner: bestOwner, longestRoadLength: bestLen };
    s = log(s, `${s.players[bestOwner]?.name} took the Longest Road!`);
  } else if (s.longestRoadOwner) {
    // No challenger — check if the current owner still has at least 5 roads
    if (ownerLen >= 5) {
      // Keep owner; update length in case it grew
      if (ownerLen !== s.longestRoadLength) {
        s = { ...s, longestRoadLength: ownerLen };
      }
    } else {
      s = { ...s, longestRoadOwner: null, longestRoadLength: 0 };
    }
  } else {
    // No current owner — check if anyone newly reached 5
    // (bestLen stayed at 4 so nobody hit 5 — nothing to do)
  }

  return s;
}

function isKnightMoveReachable(
  board: BoardState,
  graph: ReturnType<typeof buildGraph>,
  playerId: PlayerId,
  from: VertexId,
  to: VertexId,
): boolean {
  if (from === to) return false;
  const visited = new Set<VertexId>([from]);
  const queue: VertexId[] = [from];

  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) return true;
    for (const eid of graph.edgesOfVertex[cur] ?? []) {
      const road = board.edges[eid];
      if (!road || road.playerId !== playerId) continue;
      const [a, b] = graph.verticesOfEdge[eid] ?? [];
      const next = a === cur ? b : a;
      if (!next) continue;
      if (next !== to) {
        const blockerBuilding = board.vertices[next];
        if (blockerBuilding && blockerBuilding.playerId !== playerId) continue;
        const blockerKnight = board.knights[next];
        if (blockerKnight && blockerKnight.playerId !== playerId) continue;
      }
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }

  return false;
}

// ─── Steal Card ───────────────────────────────────────────────────────────────

function stealRandomCard(
  state: GameState,
  thief: PlayerId,
  victim: PlayerId,
): GameState {
  const victimPlayer = state.players[victim]!;
  const allCards: (keyof Resources)[] = [];
  for (const [k, v] of Object.entries(victimPlayer.resources) as [
    keyof Resources,
    number,
  ][]) {
    for (let i = 0; i < v; i++) allCards.push(k);
  }
  if (allCards.length === 0) return state;

  const stolen = allCards[Math.floor(Math.random() * allCards.length)]!;
  const thiefPlayer = state.players[thief]!;

  return {
    ...state,
    players: {
      ...state.players,
      [victim]: {
        ...victimPlayer,
        resources: subtractResources(victimPlayer.resources, {
          [stolen]: 1,
        } as Partial<Resources>),
      },
      [thief]: {
        ...thiefPlayer,
        resources: addResources(thiefPlayer.resources, {
          [stolen]: 1,
        } as Partial<Resources>),
      },
    },
  };
}

// ─── Win Check ────────────────────────────────────────────────────────────────

function checkWin(state: GameState): GameState {
  if (state.phase === "GAME_OVER") return state;
  const vp = computeVP(state, state.currentPlayerId);
  if (vp >= 13) {
    return { ...state, phase: "GAME_OVER", winner: state.currentPlayerId };
  }
  return state;
}

// ─── Progress Card Effects (simplified) ──────────────────────────────────────

function applyProgressCard(
  state: GameState,
  pid: PlayerId,
  cardName: string,
  params: unknown,
): GameState {
  // Helper to safely extract params properties
  const getParam = <T = unknown>(key: string): T | undefined =>
    (params && typeof params === "object" && key in params
      ? (params as Record<string, unknown>)[key]
      : undefined) as T | undefined;

  let s = state;
  const player = s.players[pid]!;

  // Alchemy can only be played before rolling; all other cards in action phase.
  if (cardName === "Alchemy") {
    if (s.phase !== "ROLL_DICE") return s;
  } else if (s.phase !== "ACTION") {
    return s;
  }

  if (s.currentPlayerId !== pid) return s;

  // Remove card from hand
  const cardIdx = player.progressCards.findIndex((c) => c.name === cardName);
  if (cardIdx === -1) return s;
  const newCards = [...player.progressCards];
  newCards.splice(cardIdx, 1);
  s = {
    ...s,
    players: { ...s.players, [pid]: { ...player, progressCards: newCards } },
  };
  s = log(s, `${player.name} played ${progressCardTag(cardName)}.`);

  // Update player reference to the card-removed version for use in switch cases
  const playerAfterCardRemoval = s.players[pid]!;

  switch (cardName) {
    case "Alchemy": {
      const die1 = Number(getParam<number>("die1") ?? 0);
      const die2 = Number(getParam<number>("die2") ?? 0);
      if (
        !Number.isInteger(die1) ||
        !Number.isInteger(die2) ||
        die1 < 1 ||
        die1 > 6 ||
        die2 < 1 ||
        die2 > 6
      ) {
        return state;
      }
      return applyAction(s, {
        type: "ROLL_DICE",
        pid,
        result: [die1, die2, rollEventDie()],
      });
    }
    case "RoadBuilding": {
      s = { ...s, pendingFreeRoads: { pid, remaining: 2 } };
      break;
    }
    case "Irrigation": {
      // Take 2 grain per field hex adjacent to own buildings
      const graph = buildGraph();
      let grain = 0;
      for (const [hid, hex] of Object.entries(s.board.hexes)) {
        if (hex.terrain !== "fields") continue;
        const verts = graph.verticesOfHex[hid] ?? [];
        if (verts.some((v) => s.board.vertices[v]?.playerId === pid))
          grain += 2;
      }
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...s.players[pid]!,
            resources: addResources(s.players[pid]!.resources, { grain }),
          },
        },
      };
      if (grain > 0) {
        s = log(s, gainedFromCardText(player.name, "Irrigation", { grain }));
      } else {
        s = log(s, sillyNoOpProgressText(player.name));
      }
      break;
    }
    case "Mining": {
      // Take 2 ore per mountain hex adjacent to own buildings
      const graph = buildGraph();
      let ore = 0;
      for (const [hid, hex] of Object.entries(s.board.hexes)) {
        if (hex.terrain !== "mountains") continue;
        const verts = graph.verticesOfHex[hid] ?? [];
        if (verts.some((v) => s.board.vertices[v]?.playerId === pid)) ore += 2;
      }
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...s.players[pid]!,
            resources: addResources(s.players[pid]!.resources, { ore }),
          },
        },
      };
      if (ore > 0) {
        s = log(s, gainedFromCardText(player.name, "Mining", { ore }));
      } else {
        s = log(s, sillyNoOpProgressText(player.name));
      }
      break;
    }
    case "Medicine": {
      const targetVid = getParam<VertexId>("vid");
      if (!targetVid) {
        return s;
      }
      const vertex = s.board.vertices[targetVid];
      if (!vertex || vertex.type !== "settlement" || vertex.playerId !== pid)
        break;
      if (
        (playerAfterCardRemoval.resources.grain ?? 0) < 1 ||
        (playerAfterCardRemoval.resources.ore ?? 0) < 2
      )
        break;
      if (playerAfterCardRemoval.supply.cities <= 0) break;
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...playerAfterCardRemoval,
            resources: subtractResources(playerAfterCardRemoval.resources, {
              grain: 1,
              ore: 2,
            }),
            supply: {
              ...playerAfterCardRemoval.supply,
              settlements: playerAfterCardRemoval.supply.settlements + 1,
              cities: playerAfterCardRemoval.supply.cities - 1,
            },
          },
        },
        board: {
          ...s.board,
          vertices: {
            ...s.board.vertices,
            [targetVid]: {
              type: "city",
              playerId: pid,
              hasWall: false,
              metropolis: null,
            },
          },
        },
      };
      s = log(
        s,
        resolvedCardText(player.name, "Medicine", { grain: 1, ore: 2 }),
      );
      break;
    }
    case "Smithing": {
      s = { ...s, pendingKnightPromotions: { pid, remaining: 2 } };
      break;
    }
    case "Merchant": {
      const targetHex = getParam<HexId>("hid");
      if (!targetHex) {
        return s;
      }
      const mGraph = buildGraph();
      const mVerts = mGraph.verticesOfHex[targetHex] ?? [];
      if (!mVerts.some((v) => s.board.vertices[v]?.playerId === pid)) break;
      s = {
        ...s,
        board: { ...s.board, merchantHex: targetHex, merchantOwner: pid },
      };
      break;
    }
    case "Encouragement": {
      const knights = Object.fromEntries(
        Object.entries(s.board.knights).map(([vid, knight]) => {
          if (!knight || knight.playerId !== pid) return [vid, knight];
          return [vid, { ...knight, active: true }];
        }),
      ) as typeof s.board.knights;
      s = {
        ...s,
        board: {
          ...s.board,
          knights,
        },
      };
      break;
    }
    case "ResourceMonopoly": {
      const resource = getParam<ResourceType>("resource");
      if (!resource) return s;
      let gained = 0;
      for (const [oppId, opp] of Object.entries(s.players)) {
        if (oppId === pid) continue;
        const available = opp.resources[resource] ?? 0;
        const taken = Math.min(2, available);
        if (taken <= 0) continue;
        gained += taken;
        s = {
          ...s,
          players: {
            ...s.players,
            [oppId]: {
              ...opp,
              resources: subtractResources(opp.resources, {
                [resource]: taken,
              }),
            },
          },
        };
      }
      if (gained > 0) {
        s = {
          ...s,
          players: {
            ...s.players,
            [pid]: {
              ...s.players[pid]!,
              resources: addResources(s.players[pid]!.resources, {
                [resource]: gained,
              }),
            },
          },
        };
        s = log(
          s,
          gainedFromCardText(player.name, "ResourceMonopoly", {
            [resource]: gained,
          } as Partial<Resources>),
        );
      } else {
        s = log(s, sillyNoOpProgressText(player.name));
      }
      break;
    }
    case "Crane": {
      s = {
        ...s,
        progressEffects: {
          ...s.progressEffects,
          craneDiscountPlayerId: pid,
        },
      };
      break;
    }
    case "MerchantFleet": {
      const cardType = getParam<keyof Resources>("cardType");
      if (!cardType) return s;
      s = {
        ...s,
        progressEffects: {
          ...s.progressEffects,
          merchantFleet: {
            playerId: pid,
            cardType,
          },
        },
      };
      break;
    }
    case "TradeMonopoly": {
      const commodity = getParam<CommodityType>("commodity");
      if (!commodity) return s;
      let gained = 0;
      for (const [oppId, opp] of Object.entries(s.players)) {
        if (oppId === pid) continue;
        const available = opp.resources[commodity] ?? 0;
        const taken = Math.min(1, available);
        if (taken <= 0) continue;
        gained += taken;
        s = {
          ...s,
          players: {
            ...s.players,
            [oppId]: {
              ...opp,
              resources: subtractResources(opp.resources, {
                [commodity]: taken,
              }),
            },
          },
        };
      }
      if (gained > 0) {
        s = {
          ...s,
          players: {
            ...s.players,
            [pid]: {
              ...s.players[pid]!,
              resources: addResources(s.players[pid]!.resources, {
                [commodity]: gained,
              }),
            },
          },
        };
        s = log(
          s,
          gainedFromCardText(player.name, "TradeMonopoly", {
            [commodity]: gained,
          } as Partial<Resources>),
        );
      } else {
        s = log(s, sillyNoOpProgressText(player.name));
      }
      break;
    }
    case "Sabotage": {
      // Each player with >= current player's VP discards half
      const myVP = computeVP(s, pid);
      let didDiscard = false;
      for (const [oppId, opp] of Object.entries(s.players)) {
        if (oppId === pid) continue;
        if (computeVP(s, oppId) >= myVP) {
          const total = Object.values(opp.resources).reduce((a, b) => a + b, 0);
          const discard = Math.floor(total / 2);
          if (discard > 0) {
            // Auto-discard lowest priority resources
            const newRes = autoDiscard(opp.resources, discard);
            didDiscard = true;
            s = {
              ...s,
              players: { ...s.players, [oppId]: { ...opp, resources: newRes } },
            };
          }
        }
      }
      if (!didDiscard) {
        s = log(s, sillyNoOpProgressText(player.name));
      }
      break;
    }
    case "Wedding": {
      const myVP = computeVP(s, pid);
      let gained = emptyResources();
      for (const [oppId, opp] of Object.entries(s.players)) {
        if (oppId === pid) continue;
        if (computeVP(s, oppId) <= myVP) continue;
        const moved = transferCardsByPriority(opp.resources, 2);
        if (Object.values(moved.transferred).some((v) => (v ?? 0) > 0)) {
          s = {
            ...s,
            players: {
              ...s.players,
              [oppId]: {
                ...opp,
                resources: moved.remaining,
              },
            },
          };
          gained = addResources(gained, moved.transferred);
        }
      }

      if (Object.values(gained).some((v) => (v ?? 0) > 0)) {
        s = {
          ...s,
          players: {
            ...s.players,
            [pid]: {
              ...s.players[pid]!,
              resources: addResources(s.players[pid]!.resources, gained),
            },
          },
        };
        s = log(s, gainedFromCardText(player.name, "Wedding", gained));
      } else {
        s = log(s, sillyNoOpProgressText(player.name));
      }
      break;
    }
    case "Engineering": {
      const engVid = getParam<VertexId>("vid");
      if (!engVid) {
        return s;
      }
      const engCity = s.board.vertices[engVid];
      if (
        !engCity ||
        engCity.type !== "city" ||
        engCity.playerId !== pid ||
        engCity.hasWall
      )
        break;
      if (playerAfterCardRemoval.supply.cityWalls <= 0) break;
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...playerAfterCardRemoval,
            supply: {
              ...playerAfterCardRemoval.supply,
              cityWalls: playerAfterCardRemoval.supply.cityWalls - 1,
            },
          },
        },
        board: {
          ...s.board,
          vertices: {
            ...s.board.vertices,
            [engVid]: { ...engCity, hasWall: true },
          },
        },
      };
      break;
    }
    case "Invention": {
      const hid1 = getParam<HexId>("hid1");
      const hid2 = getParam<HexId>("hid2");
      if (!hid1 || !hid2 || hid1 === hid2) {
        return s;
      }
      const invHex1 = s.board.hexes[hid1];
      const invHex2 = s.board.hexes[hid2];
      if (!invHex1 || !invHex2) break;
      const forbidden = [2, 6, 8, 12];
      if (
        forbidden.includes(invHex1.number ?? 0) ||
        forbidden.includes(invHex2.number ?? 0)
      )
        break;
      if (!invHex1.number || !invHex2.number) break;
      s = {
        ...s,
        board: {
          ...s.board,
          hexes: {
            ...s.board.hexes,
            [hid1]: { ...invHex1, number: invHex2.number },
            [hid2]: { ...invHex2, number: invHex1.number },
          },
        },
      };
      break;
    }
    case "Taxation": {
      if (!s.barbarian.robberActive) {
        return s;
      }
      const taxHid = getParam<HexId>("hid");
      if (!taxHid) {
        return s;
      }
      const taxGraph = buildGraph();
      const taxHexes = Object.fromEntries(
        Object.entries(s.board.hexes).map(([k, v]) => [
          k,
          { ...v, hasRobber: false },
        ]),
      ) as typeof s.board.hexes;
      taxHexes[taxHid] = { ...taxHexes[taxHid]!, hasRobber: true };
      s = { ...s, board: { ...s.board, hexes: taxHexes } };
      const taxVerts = taxGraph.verticesOfHex[taxHid] ?? [];
      const stolenFrom = new Set<PlayerId>();
      for (const vid of taxVerts) {
        const b = s.board.vertices[vid];
        if (!b || b.playerId === pid || stolenFrom.has(b.playerId)) continue;
        stolenFrom.add(b.playerId);
        s = stealRandomCard(s, pid, b.playerId);
      }
      break;
    }
    case "Diplomacy": {
      const dipEid = getParam<EdgeId>("eid");
      if (!dipEid) {
        return s;
      }
      const dipGraph = buildGraph();
      const dipRoad = s.board.edges[dipEid];
      if (!dipRoad) break;
      if (!isOpenRoad(s.board, dipGraph, dipEid)) break;
      const roadOwner = dipRoad.playerId;
      const roadOwnerPlayer = s.players[roadOwner]!;
      s = {
        ...s,
        players: {
          ...s.players,
          [roadOwner]: {
            ...roadOwnerPlayer,
            supply: {
              ...roadOwnerPlayer.supply,
              roads: roadOwnerPlayer.supply.roads + 1,
            },
          },
        },
        board: { ...s.board, edges: { ...s.board.edges, [dipEid]: null } },
      };
      s = updateLongestRoad(s);
      if (roadOwner === pid) {
        s = { ...s, pendingFreeRoads: { pid, remaining: 1 } };
      }
      break;
    }
    case "Intrigue": {
      const intVid = getParam<VertexId>("vid");
      if (!intVid) {
        return s;
      }
      const intGraph = buildGraph();
      const intKnight = s.board.knights[intVid];
      if (!intKnight || intKnight.playerId === pid) break;
      if (!isOnPlayerNetwork(s.board, intGraph, pid, intVid)) break;
      s = {
        ...s,
        board: { ...s.board, knights: { ...s.board.knights, [intVid]: null } },
        pendingDisplace: {
          displacerPlayerId: pid,
          displacedPlayerId: intKnight.playerId,
          displacedKnightVertex: intVid,
          displacedKnightStrength: intKnight.strength,
        },
        phase: "KNIGHT_DISPLACE_RESPONSE",
      };
      break;
    }
    case "Treason": {
      const trsVid = getParam<VertexId>("vid");
      if (!trsVid) return s;
      const trsKnight = s.board.knights[trsVid];
      if (!trsKnight || trsKnight.playerId === pid) break;
      const trsPid = trsKnight.playerId;
      const trsTarget = s.players[trsPid]!;
      const trsMaxStr = trsKnight.strength;
      const trsHasKnight = hasKnightUpTo(s.players[pid]!, trsMaxStr);
      s = {
        ...s,
        players: {
          ...s.players,
          [trsPid]: {
            ...trsTarget,
            supply: {
              ...trsTarget.supply,
              knights: {
                ...trsTarget.supply.knights,
                [trsKnight.strength]:
                  trsTarget.supply.knights[trsKnight.strength] + 1,
              },
            },
          },
        },
        board: { ...s.board, knights: { ...s.board.knights, [trsVid]: null } },
        pendingTreason: trsHasKnight ? { pid, maxStrength: trsMaxStr, active: trsKnight.active } : null,
      };
      break;
    }
    case "CommercialHarbor": {
      const chResource = getParam<ResourceType>("resource");
      if (!chResource) {
        return s;
      }
      const chPlayer = s.players[pid]!;
      if ((chPlayer.resources[chResource] ?? 0) <= 0) {
        return state;
      }
      const opponents = s.playerOrder.filter((p) => p !== pid);
      if (opponents.length === 0) break;
      s = {
        ...s,
        pendingCommercialHarbor: {
          initiatorPid: pid,
          offeredResource: chResource,
          remainingPids: opponents,
        },
      };
      break;
    }
    case "Espionage": {
      const espTarget = getParam<PlayerId>("targetPid");
      if (!espTarget || espTarget === pid) {
        return s;
      }
      const espTargetPlayer = s.players[espTarget];
      if (!espTargetPlayer) break;
      const espCardIndex = getParam<number>("cardIndex");
      if (espCardIndex === undefined) break;
      const nonVP = espTargetPlayer.progressCards
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => !c.isVP);
      const entry = nonVP[espCardIndex];
      if (!entry) break;
      const newTargetCards = [...espTargetPlayer.progressCards];
      newTargetCards.splice(entry.i, 1);
      s = {
        ...s,
        players: {
          ...s.players,
          [espTarget]: { ...espTargetPlayer, progressCards: newTargetCards },
          [pid]: {
            ...s.players[pid]!,
            progressCards: [...s.players[pid]!.progressCards, entry.c],
          },
        },
      };
      break;
    }
    case "GuildDues": {
      const gdTarget = getParam<PlayerId>("targetPid");
      const gdCards = getParam<Partial<Resources>>("takeCards");
      if (!gdTarget || !gdCards || gdTarget === pid) {
        return s;
      }
      const gdTargetPlayer = s.players[gdTarget];
      if (!gdTargetPlayer) break;
      if (computeVP(s, gdTarget) < computeVP(s, pid)) break;
      const gdTotal = (Object.values(gdCards) as number[]).reduce(
        (a, b) => a + (b ?? 0),
        0,
      );
      if (gdTotal > 2) return state;
      for (const [k, v] of Object.entries(gdCards) as [
        keyof Resources,
        number,
      ][]) {
        if ((gdTargetPlayer.resources[k] ?? 0) < (v ?? 0)) return state;
      }
      s = {
        ...s,
        players: {
          ...s.players,
          [gdTarget]: {
            ...gdTargetPlayer,
            resources: subtractResources(gdTargetPlayer.resources, gdCards),
          },
          [pid]: {
            ...s.players[pid]!,
            resources: addResources(s.players[pid]!.resources, gdCards),
          },
        },
      };
      break;
    }
    default:
      break;
  }

  return checkWin(s);
}

function autoDiscard(resources: Resources, amount: number): Resources {
  const result = { ...resources };
  const keys: (keyof Resources)[] = [
    "cloth",
    "coin",
    "paper",
    "brick",
    "lumber",
    "wool",
    "grain",
    "ore",
  ];
  let remaining = amount;
  for (const k of keys) {
    while (remaining > 0 && (result[k] ?? 0) > 0) {
      result[k] = result[k]! - 1;
      remaining--;
    }
  }
  return result;
}

function transferCardsByPriority(
  resources: Resources,
  amount: number,
): { remaining: Resources; transferred: Partial<Resources> } {
  const remaining = { ...resources };
  const transferred: Partial<Resources> = {};
  const keys: (keyof Resources)[] = [
    "cloth",
    "coin",
    "paper",
    "brick",
    "lumber",
    "wool",
    "grain",
    "ore",
  ];

  let need = amount;
  for (const key of keys) {
    while (need > 0 && (remaining[key] ?? 0) > 0) {
      remaining[key] = (remaining[key] ?? 0) - 1;
      transferred[key] = (transferred[key] ?? 0) + 1;
      need--;
    }
    if (need === 0) break;
  }

  return { remaining, transferred };
}
