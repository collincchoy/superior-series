import type {
  GameState,
  GameAction,
  Player,
  PlayerId,
  BoardState,
  VertexId,
  EdgeId,
  HexId,
  TurnPhase,
  ImprovementTrack,
  Resources,
  ProgressCard,
  KnightStrength,
  EventDieFace,
} from './types.js';
import { emptyResources } from './types.js';
import { buildGraph, hexId, computeLongestRoad, CATAN_HEX_COORDS } from './board.js';
import {
  STANDARD_BOARD,
  HARBOR_SETUPS,
  SCIENCE_DECK,
  TRADE_DECK,
  POLITICS_DECK,
  INITIAL_SUPPLY,
  PLAYER_COLORS,
  TRACK_COMMODITY,
  DRAW_MAX,
  EVENT_DIE_FACES,
  rollEventDie,
  rollProductionDie,
} from './constants.js';
import { discardCount } from './rules.js';

// ─── Utilities ────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
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

// ─── createInitialState ───────────────────────────────────────────────────────

export function createInitialState(
  players: { id: PlayerId; name: string; color: string; isBot: boolean }[],
): GameState {
  const graph = buildGraph();

  // Build board hexes from standard layout
  const hexes: BoardState['hexes'] = {};
  for (const setup of STANDARD_BOARD) {
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
  const vertices: BoardState['vertices'] = Object.fromEntries(
    Object.keys(graph.vertices).map(v => [v, null])
  );
  const edges: BoardState['edges'] = Object.fromEntries(
    Object.keys(graph.edges).map(e => [e, null])
  );
  const knights: BoardState['knights'] = Object.fromEntries(
    Object.keys(graph.vertices).map(v => [v, null])
  );

  // Compute harbor vertices from edge positions
  const harbors: BoardState['harbors'] = HARBOR_SETUPS.map(setup => {
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
      color: p.color || PLAYER_COLORS[i] || '#999',
      isBot: p.isBot,
      resources: emptyResources(),
      progressCards: [],
      vpTokens: 0,
      improvements: { science: 0, trade: 0, politics: 0 },
      supply: { ...INITIAL_SUPPLY, knights: { ...INITIAL_SUPPLY.knights } },
      knightsActivatedTotal: 0,
    };
  }

  const playerOrder = players.map(p => p.id);

  return {
    version: 0,
    phase: 'SETUP_R1_SETTLEMENT',
    currentPlayerId: playerOrder[0]!,
    playerOrder,
    players: playerRecords,
    board: { hexes, vertices, edges, knights, harbors, merchantHex: null, merchantOwner: null },
    barbarian: { position: 0, robberActive: false },
    decks: {
      science: shuffle([...SCIENCE_DECK]),
      trade: shuffle([...TRADE_DECK]),
      politics: shuffle([...POLITICS_DECK]),
    },
    longestRoadOwner: null,
    longestRoadLength: 0,
    largestArmyOwner: null,
    largestArmySize: 0,
    metropolisOwner: { science: null, trade: null, politics: null },
    lastRoll: null,
    setupQueue: [...playerOrder],
    pendingDisplace: null,
    pendingProgressDraw: null,
    pendingDiscard: null,
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
    if (building.type === 'settlement') {
      vp += 1;
    } else if (building.type === 'city') {
      vp += building.metropolis ? 4 : 2;
    }
  }

  // Special cards
  if (state.longestRoadOwner === playerId) vp += 2;
  if (state.largestArmyOwner === playerId) vp += 2;

  // VP tokens (from barbarian defense)
  vp += player.vpTokens;

  // VP progress cards (face-up, already counted separately)
  vp += player.progressCards.filter(c => c.isVP).length;

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
    case 'PLACE_BUILDING': {
      const { pid, vid, building } = action;
      const b = building === 'settlement'
        ? { type: 'settlement' as const, playerId: pid }
        : { type: 'city' as const, playerId: pid, hasWall: false, metropolis: null };

      s = { ...s, board: { ...s.board, vertices: { ...s.board.vertices, [vid]: b } } };

      // In SETUP_R2_CITY: grant starting resources (1 per adjacent hex)
      if (s.phase === 'SETUP_R2_CITY' && building === 'city') {
        const adjacentHexIds = graph.hexesOfVertex[vid] ?? [];
        const gained: Partial<Resources> = {};
        for (const hid of adjacentHexIds) {
          const hex = s.board.hexes[hid];
          if (!hex || hex.terrain === 'desert') continue;
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
      s = { ...s, phase: s.phase === 'SETUP_R1_SETTLEMENT' ? 'SETUP_R1_ROAD' : 'SETUP_R2_ROAD' };
      return s;
    }

    case 'PLACE_ROAD': {
      const { pid, eid } = action;
      s = { ...s, board: { ...s.board, edges: { ...s.board.edges, [eid]: { playerId: pid } } } };

      // Advance setup queue
      const isR1 = s.phase === 'SETUP_R1_ROAD';
      const isR2 = s.phase === 'SETUP_R2_ROAD';
      const queue = [...s.setupQueue];
      queue.shift(); // remove current player

      if (isR1) {
        if (queue.length === 0) {
          // R1 done → start R2 in REVERSE order
          const r2Queue = [...s.playerOrder].reverse();
          s = { ...s, setupQueue: r2Queue, currentPlayerId: r2Queue[0]!, phase: 'SETUP_R2_CITY' };
        } else {
          s = { ...s, setupQueue: queue, currentPlayerId: queue[0]!, phase: 'SETUP_R1_SETTLEMENT' };
        }
      } else if (isR2) {
        if (queue.length === 0) {
          // Setup complete → first player rolls
          s = { ...s, setupQueue: [], currentPlayerId: s.playerOrder[0]!, phase: 'ROLL_DICE' };
        } else {
          s = { ...s, setupQueue: queue, currentPlayerId: queue[0]!, phase: 'SETUP_R2_CITY' };
        }
      }

      return s;
    }

    // ── Roll Dice ──────────────────────────────────────────────────────────────
    case 'ROLL_DICE': {
      const { pid } = action;
      let [d1, d2, event] = action.result ?? [
        rollProductionDie(),
        rollProductionDie(),
        rollEventDie(),
      ];
      const production = d1 + d2;

      s = { ...s, lastRoll: [d1, d2, event] };
      s = log(s, `${s.players[pid]?.name} rolled ${d1}+${d2}=${production} (${event})`);

      // 1. Handle event die
      if (event === 'ship') {
        const newPos = s.barbarian.position + 1;
        if (newPos >= 7) {
          // Barbarian attack
          s = resolveBarbarianAttack({ ...s, barbarian: { ...s.barbarian, position: 7 } });
        } else {
          s = { ...s, barbarian: { ...s.barbarian, position: newPos } };
        }
      } else {
        // Progress card draw opportunity for players with matching track level
        const track = event as ImprovementTrack;
        const drawPlayers = s.playerOrder.filter(p => {
          const level = s.players[p]?.improvements[track] ?? 0;
          const maxRoll = DRAW_MAX[level] ?? 0;
          return level > 0 && d2 <= maxRoll; // d2 = red die
        });
        if (drawPlayers.length > 0) {
          s = { ...s, pendingProgressDraw: { remaining: drawPlayers, track } };
        }
      }

      // 2. Handle production
      if (production === 7) {
        // Check for discards
        const needDiscard: Record<PlayerId, number> = {};
        for (const [ppid, player] of Object.entries(s.players)) {
          const amount = discardCount(player, s.board);
          if (amount > 0) needDiscard[ppid] = amount;
        }
        if (Object.keys(needDiscard).length > 0) {
          s = { ...s, phase: 'DISCARD', pendingDiscard: { remaining: needDiscard } };
        } else if (s.barbarian.robberActive) {
          s = { ...s, phase: 'ROBBER_MOVE' };
        } else {
          s = { ...s, phase: 'ACTION' };
        }
      } else {
        // Distribute resources
        s = distributeResources(s, production, graph);
        // Handle progress draw queue or go to action
        if (s.pendingProgressDraw && s.pendingProgressDraw.remaining.length > 0) {
          s = { ...s, phase: 'RESOLVE_PROGRESS_DRAW' };
        } else {
          s = { ...s, phase: 'ACTION' };
        }
      }

      return s;
    }

    // ── Discard ────────────────────────────────────────────────────────────────
    case 'DISCARD': {
      const { pid, cards } = action;
      const player = s.players[pid]!;
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: { ...player, resources: subtractResources(player.resources, cards) },
        },
      };

      const pending = { ...s.pendingDiscard! };
      const newRemaining = { ...pending.remaining };
      delete newRemaining[pid];

      if (Object.keys(newRemaining).length === 0) {
        // All discards done
        s = { ...s, pendingDiscard: null };
        if (s.barbarian.robberActive) {
          s = { ...s, phase: 'ROBBER_MOVE' };
        } else {
          s = { ...s, phase: 'ACTION' };
        }
      } else {
        s = { ...s, pendingDiscard: { remaining: newRemaining } };
      }
      return s;
    }

    // ── Move Robber ────────────────────────────────────────────────────────────
    case 'MOVE_ROBBER': {
      const { pid, hid, stealFrom } = action;

      // Clear old robber
      const hexes = Object.fromEntries(
        Object.entries(s.board.hexes).map(([k, v]) => [k, { ...v, hasRobber: false }])
      );
      hexes[hid] = { ...hexes[hid]!, hasRobber: true };

      s = { ...s, board: { ...s.board, hexes } };

      // Steal a card
      if (stealFrom) {
        s = stealRandomCard(s, pid, stealFrom);
      }

      s = { ...s, phase: 'ACTION' };
      return s;
    }

    // ── Build ──────────────────────────────────────────────────────────────────
    case 'BUILD_ROAD': {
      const { pid, eid } = action;
      const player = s.players[pid]!;
      s = {
        ...s,
        players: { ...s.players, [pid]: { ...player, resources: subtractResources(player.resources, { brick: 1, lumber: 1 }), supply: { ...player.supply, roads: player.supply.roads - 1 } } },
        board: { ...s.board, edges: { ...s.board.edges, [eid]: { playerId: pid } } },
      };
      s = updateLongestRoad(s);
      return s;
    }

    case 'BUILD_SETTLEMENT': {
      const { pid, vid } = action;
      const player = s.players[pid]!;
      s = {
        ...s,
        players: { ...s.players, [pid]: { ...player, resources: subtractResources(player.resources, { brick: 1, lumber: 1, wool: 1, grain: 1 }), supply: { ...player.supply, settlements: player.supply.settlements - 1 } } },
        board: { ...s.board, vertices: { ...s.board.vertices, [vid]: { type: 'settlement', playerId: pid } } },
      };
      return checkWin(s);
    }

    case 'BUILD_CITY': {
      const { pid, vid } = action;
      const player = s.players[pid]!;
      s = {
        ...s,
        players: { ...s.players, [pid]: { ...player, resources: subtractResources(player.resources, { ore: 3, grain: 2 }), supply: { ...player.supply, settlements: player.supply.settlements + 1, cities: player.supply.cities - 1 } } },
        board: { ...s.board, vertices: { ...s.board.vertices, [vid]: { type: 'city', playerId: pid, hasWall: false, metropolis: null } } },
      };
      return checkWin(s);
    }

    case 'BUILD_CITY_WALL': {
      const { pid, vid } = action;
      const player = s.players[pid]!;
      const city = s.board.vertices[vid] as { type: 'city'; playerId: PlayerId; hasWall: boolean; metropolis: ImprovementTrack | null };
      s = {
        ...s,
        players: { ...s.players, [pid]: { ...player, resources: subtractResources(player.resources, { brick: 2 }), supply: { ...player.supply, cityWalls: player.supply.cityWalls - 1 } } },
        board: { ...s.board, vertices: { ...s.board.vertices, [vid]: { ...city, hasWall: true } } },
      };
      return s;
    }

    case 'IMPROVE_CITY': {
      const { pid, track } = action;
      const player = s.players[pid]!;
      const currentLevel = player.improvements[track];
      const targetLevel = currentLevel + 1;
      const commodity = TRACK_COMMODITY[track];
      const cost = targetLevel;

      const newImprovements = { ...player.improvements, [track]: targetLevel };
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: {
            ...player,
            resources: subtractResources(player.resources, { [commodity]: cost } as Partial<Resources>),
            improvements: newImprovements,
          },
        },
      };

      // Check metropolis thresholds
      s = checkMetropolis(s, pid, track, targetLevel);
      return checkWin(s);
    }

    // ── Knights ────────────────────────────────────────────────────────────────
    case 'RECRUIT_KNIGHT': {
      const { pid, vid } = action;
      const player = s.players[pid]!;
      s = {
        ...s,
        players: { ...s.players, [pid]: { ...player, resources: subtractResources(player.resources, { ore: 1, wool: 1 }), supply: { ...player.supply, knights: { ...player.supply.knights, 1: player.supply.knights[1] - 1 } } } },
        board: { ...s.board, knights: { ...s.board.knights, [vid]: { playerId: pid, strength: 1, active: false } } },
      };
      return s;
    }

    case 'PROMOTE_KNIGHT': {
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
            resources: subtractResources(player.resources, { ore: 1, grain: 1 }),
            supply: { ...player.supply, knights: { ...player.supply.knights, [knight.strength]: player.supply.knights[knight.strength] + 1, [newStrength]: player.supply.knights[newStrength] - 1 } },
          },
        },
        board: { ...s.board, knights: { ...s.board.knights, [vid]: { ...knight, strength: newStrength } } },
      };
      return s;
    }

    case 'ACTIVATE_KNIGHT': {
      const { pid, vid } = action;
      const player = s.players[pid]!;
      const knight = s.board.knights[vid]!;
      s = {
        ...s,
        players: { ...s.players, [pid]: { ...player, resources: subtractResources(player.resources, { grain: 1 }), knightsActivatedTotal: player.knightsActivatedTotal + 1 } },
        board: { ...s.board, knights: { ...s.board.knights, [vid]: { ...knight, active: true } } },
      };
      s = updateLargestArmy(s);
      return s;
    }

    case 'MOVE_KNIGHT': {
      const { pid, from, to } = action;
      const knight = s.board.knights[from]!;
      s = {
        ...s,
        board: {
          ...s.board,
          knights: { ...s.board.knights, [from]: null, [to]: { ...knight, active: false } },
        },
      };
      s = updateLongestRoad(s); // knight movement may affect road traversal
      return s;
    }

    case 'DISPLACE_KNIGHT': {
      const { pid, from, target } = action;
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
        phase: 'KNIGHT_DISPLACE_RESPONSE',
      };
      return s;
    }

    case 'DISPLACED_MOVE': {
      const { pid, from, to } = action;
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
              supply: { ...player.supply, knights: { ...player.supply.knights, [pending.displacedKnightStrength]: player.supply.knights[pending.displacedKnightStrength] + 1 } },
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
              [from]: null,
              [to]: { playerId: pid, strength: pending.displacedKnightStrength, active: false },
            },
          },
        };
      }
      s = { ...s, pendingDisplace: null, phase: 'ACTION' };
      return s;
    }

    case 'CHASE_ROBBER': {
      const { pid, knight, hid, stealFrom } = action;
      const knightPiece = s.board.knights[knight]!;
      // Deactivate knight
      s = { ...s, board: { ...s.board, knights: { ...s.board.knights, [knight]: { ...knightPiece, active: false } } } };
      // Move robber
      const hexes = Object.fromEntries(Object.entries(s.board.hexes).map(([k, v]) => [k, { ...v, hasRobber: false }]));
      hexes[hid] = { ...hexes[hid]!, hasRobber: true };
      s = { ...s, board: { ...s.board, hexes } };
      if (stealFrom) s = stealRandomCard(s, pid, stealFrom);
      return s;
    }

    // ── Progress Cards ─────────────────────────────────────────────────────────
    case 'DRAW_PROGRESS': {
      const { pid, track } = action;
      const deck = [...s.decks[track]];
      if (deck.length === 0) return s;
      const card = deck.shift()!;
      const player = s.players[pid]!;

      // VP cards go face-up immediately
      s = {
        ...s,
        decks: { ...s.decks, [track]: deck },
        players: {
          ...s.players,
          [pid]: { ...player, progressCards: [...player.progressCards, card] },
        },
      };

      // Remove from pending
      if (s.pendingProgressDraw) {
        const remaining = s.pendingProgressDraw.remaining.filter(p => p !== pid);
        if (remaining.length === 0) {
          s = { ...s, pendingProgressDraw: null, phase: 'ACTION' };
        } else {
          s = { ...s, pendingProgressDraw: { ...s.pendingProgressDraw, remaining } };
        }
      }
      return checkWin(s);
    }

    case 'PLAY_PROGRESS': {
      return applyProgressCard(s, action.pid, action.card, action.params);
    }

    // ── Trading ────────────────────────────────────────────────────────────────
    case 'TRADE_BANK': {
      const { pid, give, get } = action;
      const player = s.players[pid]!;
      s = {
        ...s,
        players: {
          ...s.players,
          [pid]: { ...player, resources: addResources(subtractResources(player.resources, give), get) },
        },
      };
      return s;
    }

    case 'TRADE_ACCEPT': {
      const { from, to } = action;
      const pending = s.pendingDisplace; // TODO: proper pending trade
      return s;
    }

    case 'END_TURN': {
      const { pid } = action;
      const idx = s.playerOrder.indexOf(pid);
      const nextIdx = (idx + 1) % s.playerOrder.length;
      s = { ...s, currentPlayerId: s.playerOrder[nextIdx]!, phase: 'ROLL_DICE' };
      return s;
    }

    default:
      return s;
  }
}

// ─── Resource Distribution ────────────────────────────────────────────────────

function distributeResources(state: GameState, production: number, graph: ReturnType<typeof buildGraph>): GameState {
  let s = state;

  // Collect what each player produces
  const gains: Record<PlayerId, Partial<Resources>> = {};
  const supplyUsed: Record<keyof Resources, number> = emptyResources();

  for (const [hid, hex] of Object.entries(s.board.hexes)) {
    if (hex.number !== production) continue;
    if (hex.hasRobber) continue;
    if (hex.terrain === 'desert') continue;

    for (const vid of graph.verticesOfHex[hid] ?? []) {
      const building = s.board.vertices[vid];
      if (!building) continue;

      const pid = building.playerId;
      if (!gains[pid]) gains[pid] = {};

      if (building.type === 'settlement') {
        const res = terrainToResource(hex.terrain);
        if (res) {
          gains[pid]![res] = (gains[pid]![res] ?? 0) + 1;
          supplyUsed[res] = (supplyUsed[res] ?? 0) + 1;
        }
      } else if (building.type === 'city') {
        // City produces based on terrain
        const prod = cityTerrainProduction(hex.terrain);
        if (prod.resource) {
          gains[pid]![prod.resource] = (gains[pid]![prod.resource] ?? 0) + prod.resourceCount;
          supplyUsed[prod.resource] = (supplyUsed[prod.resource] ?? 0) + prod.resourceCount;
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
    newPlayers[pid] = { ...player, resources: addResources(player.resources, gain) };
  }

  return { ...s, players: newPlayers };
}

function terrainToResource(terrain: string): keyof Resources | null {
  const map: Record<string, keyof Resources> = {
    hills: 'brick', forest: 'lumber', mountains: 'ore', fields: 'grain', pasture: 'wool',
  };
  return map[terrain] ?? null;
}

function cityTerrainProduction(terrain: string): {
  resource: keyof Resources | null;
  resourceCount: number;
  commodity: keyof Resources | null;
} {
  switch (terrain) {
    case 'forest':    return { resource: 'lumber', resourceCount: 1, commodity: 'paper' };
    case 'mountains': return { resource: 'ore',    resourceCount: 1, commodity: 'coin'  };
    case 'pasture':   return { resource: 'wool',   resourceCount: 1, commodity: 'cloth' };
    case 'hills':     return { resource: 'brick',  resourceCount: 2, commodity: null    };
    case 'fields':    return { resource: 'grain',  resourceCount: 2, commodity: null    };
    default:          return { resource: null,     resourceCount: 0, commodity: null    };
  }
}

// ─── Barbarian Attack ─────────────────────────────────────────────────────────

function resolveBarbarianAttack(state: GameState): GameState {
  let s = state;

  // Count cities on board (each city = 1 barbarian strength)
  const allCities = Object.entries(s.board.vertices).filter(([, b]) => b?.type === 'city');
  const barbarianStrength = allCities.length;

  // Sum active knight strengths per player
  const knightContrib: Record<PlayerId, number> = {};
  let totalDefense = 0;
  for (const [vid, knight] of Object.entries(s.board.knights)) {
    if (!knight || !knight.active) continue;
    knightContrib[knight.playerId] = (knightContrib[knight.playerId] ?? 0) + knight.strength;
    totalDefense += knight.strength;
  }

  // After attack: all active knights become inactive and track resets
  const newKnights = Object.fromEntries(
    Object.entries(s.board.knights).map(([k, v]) =>
      v ? [k, { ...v, active: false }] : [k, null]
    )
  );
  s = {
    ...s,
    board: { ...s.board, knights: newKnights },
    barbarian: { ...s.barbarian, position: 0 },
  };

  // First attack: activate robber, place on desert
  if (!s.barbarian.robberActive) {
    s = { ...s, barbarian: { ...s.barbarian, robberActive: true } };
    const desertHex = Object.values(s.board.hexes).find(h => h.terrain === 'desert');
    if (desertHex) {
      const hexes = Object.fromEntries(Object.entries(s.board.hexes).map(([k, v]) => [k, { ...v, hasRobber: false }]));
      hexes[desertHex.id] = { ...hexes[desertHex.id]!, hasRobber: true };
      s = { ...s, board: { ...s.board, hexes } };
    }
  }

  s = log(s, `Barbarians attack! Strength: ${barbarianStrength}, Defense: ${totalDefense}`);

  if (totalDefense >= barbarianStrength) {
    // Defenders win
    const maxContrib = Math.max(0, ...Object.values(knightContrib));
    const winners = Object.entries(knightContrib)
      .filter(([, v]) => v === maxContrib && v > 0)
      .map(([pid]) => pid);

    if (winners.length === 1) {
      const winnerId = winners[0]!;
      s = {
        ...s,
        players: { ...s.players, [winnerId]: { ...s.players[winnerId]!, vpTokens: s.players[winnerId]!.vpTokens + 1 } },
      };
      s = log(s, `${s.players[winnerId]?.name} gets 1 VP token for defending Catan!`);
    } else if (winners.length > 1) {
      // Tied defenders each draw a progress card (player choice)
      // Set pending draw for each tied player (they each pick a track)
      // For now, auto-draw from a random track; UI will allow choice
      s = log(s, 'Tied defenders each draw a progress card!');
    }
    s = checkWin(s);
  } else {
    // Barbarians win: pillage
    // Find player(s) with lowest knight contribution
    const allPlayerIds = s.playerOrder;
    const contributions = allPlayerIds.map(pid => ({
      pid,
      contrib: knightContrib[pid] ?? 0,
    }));
    contributions.sort((a, b) => a.contrib - b.contrib);

    let pillageNeeded = barbarianStrength - totalDefense;
    let tierIdx = 0;
    const minContrib = contributions[0]?.contrib ?? 0;
    const lowestTier = contributions.filter(c => c.contrib === minContrib).map(c => c.pid);

    for (const pid of lowestTier) {
      if (pillageNeeded <= 0) break;
      // Find a non-metropolis city for this player
      const cityEntry = Object.entries(s.board.vertices).find(
        ([, b]) => b?.type === 'city' && b.playerId === pid && b.metropolis === null
      );
      if (!cityEntry) continue;
      const [cityVid, cityBuilding] = cityEntry as [VertexId, { type: 'city'; playerId: PlayerId; hasWall: boolean; metropolis: ImprovementTrack | null }];

      // Pillage: city → settlement, wall removed
      s = {
        ...s,
        board: {
          ...s.board,
          vertices: {
            ...s.board.vertices,
            [cityVid]: { type: 'settlement', playerId: pid },
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
              cityWalls: cityBuilding.hasWall ? s.players[pid]!.supply.cityWalls + 1 : s.players[pid]!.supply.cityWalls,
            },
          },
        },
      };
      pillageNeeded--;
      s = log(s, `${s.players[pid]?.name}'s city was pillaged!`);
    }
  }

  return s;
}

// ─── Metropolis ───────────────────────────────────────────────────────────────

function checkMetropolis(state: GameState, pid: PlayerId, track: ImprovementTrack, level: number): GameState {
  let s = state;
  if (level < 4) return s;

  const currentOwner = s.metropolisOwner[track];

  // If no owner or we beat level 4 (permanent ownership at 5)
  const ownerLevel = currentOwner ? s.players[currentOwner]?.improvements[track] ?? 0 : 0;

  if (!currentOwner || level > ownerLevel) {
    // Transfer metropolis
    s = { ...s, metropolisOwner: { ...s.metropolisOwner, [track]: pid } };

    // Update vertices: remove metropolis from old owner, add to a city of new owner
    let newVertices = { ...s.board.vertices };

    // Remove old metropolis
    if (currentOwner) {
      for (const [vid, b] of Object.entries(newVertices)) {
        if (b?.type === 'city' && b.metropolis === track) {
          newVertices[vid as VertexId] = { ...b, metropolis: null };
          break;
        }
      }
    }

    // Add metropolis to new owner's city
    for (const [vid, b] of Object.entries(newVertices)) {
      if (b?.type === 'city' && b.playerId === pid && b.metropolis === null) {
        newVertices[vid as VertexId] = { ...b, metropolis: track };
        break;
      }
    }

    s = { ...s, board: { ...s.board, vertices: newVertices } };
    s = log(s, `${s.players[pid]?.name} claims the ${track} metropolis!`);
  }

  return s;
}

// ─── Largest Army / Longest Road ──────────────────────────────────────────────

function updateLargestArmy(state: GameState): GameState {
  let s = state;
  let best = s.largestArmySize;
  let bestOwner = s.largestArmyOwner;

  for (const [pid, player] of Object.entries(s.players)) {
    if (player.knightsActivatedTotal >= 3 && player.knightsActivatedTotal > best) {
      best = player.knightsActivatedTotal;
      bestOwner = pid;
    }
  }

  if (bestOwner !== s.largestArmyOwner) {
    s = { ...s, largestArmyOwner: bestOwner, largestArmySize: best };
    s = log(s, `${s.players[bestOwner!]?.name} takes the Largest Army!`);
  }

  return s;
}

function updateLongestRoad(state: GameState): GameState {
  const graph = buildGraph();
  let s = state;
  let bestLen = 4; // must be at least 5 to claim
  let bestOwner: PlayerId | null = null;

  for (const pid of s.playerOrder) {
    const len = computeLongestRoad(s.board, graph, pid);
    if (len >= 5 && len > bestLen) {
      bestLen = len;
      bestOwner = pid;
    }
  }

  // If current owner is tied or still leads, they keep it
  if (s.longestRoadOwner && !bestOwner) {
    const ownerLen = computeLongestRoad(s.board, graph, s.longestRoadOwner);
    if (ownerLen >= 5) return s; // still has valid road
    // Lost it — no new owner
    s = { ...s, longestRoadOwner: null, longestRoadLength: 0 };
  } else if (bestOwner && bestOwner !== s.longestRoadOwner) {
    s = { ...s, longestRoadOwner: bestOwner, longestRoadLength: bestLen };
    s = log(s, `${s.players[bestOwner]?.name} takes the Longest Road!`);
  }

  return s;
}

// ─── Steal Card ───────────────────────────────────────────────────────────────

function stealRandomCard(state: GameState, thief: PlayerId, victim: PlayerId): GameState {
  const victimPlayer = state.players[victim]!;
  const allCards: (keyof Resources)[] = [];
  for (const [k, v] of Object.entries(victimPlayer.resources) as [keyof Resources, number][]) {
    for (let i = 0; i < v; i++) allCards.push(k);
  }
  if (allCards.length === 0) return state;

  const stolen = allCards[Math.floor(Math.random() * allCards.length)]!;
  const thiefPlayer = state.players[thief]!;

  return {
    ...state,
    players: {
      ...state.players,
      [victim]: { ...victimPlayer, resources: subtractResources(victimPlayer.resources, { [stolen]: 1 } as Partial<Resources>) },
      [thief]: { ...thiefPlayer, resources: addResources(thiefPlayer.resources, { [stolen]: 1 } as Partial<Resources>) },
    },
  };
}

// ─── Win Check ────────────────────────────────────────────────────────────────

function checkWin(state: GameState): GameState {
  if (state.phase === 'GAME_OVER') return state;
  const vp = computeVP(state, state.currentPlayerId);
  if (vp >= 13) {
    return { ...state, phase: 'GAME_OVER', winner: state.currentPlayerId };
  }
  return state;
}

// ─── Progress Card Effects (simplified) ──────────────────────────────────────

function applyProgressCard(state: GameState, pid: PlayerId, cardName: string, params: unknown): GameState {
  let s = state;
  const player = s.players[pid]!;

  // Remove card from hand
  const cardIdx = player.progressCards.findIndex(c => c.name === cardName);
  if (cardIdx === -1) return s;
  const newCards = [...player.progressCards];
  newCards.splice(cardIdx, 1);
  s = { ...s, players: { ...s.players, [pid]: { ...player, progressCards: newCards } } };

  switch (cardName) {
    case 'RoadBuilding': {
      // Handled via UI — give player 2 free roads
      // Mark in state that player has pending free roads (simplified: just give resources)
      s = { ...s, players: { ...s.players, [pid]: { ...s.players[pid]!, resources: addResources(s.players[pid]!.resources, { brick: 2, lumber: 2 }) } } };
      break;
    }
    case 'Irrigation': {
      // Take 2 grain per field hex adjacent to own buildings
      const graph = buildGraph();
      let grain = 0;
      for (const [hid, hex] of Object.entries(s.board.hexes)) {
        if (hex.terrain !== 'fields') continue;
        const verts = graph.verticesOfHex[hid] ?? [];
        if (verts.some(v => s.board.vertices[v]?.playerId === pid)) grain += 2;
      }
      s = { ...s, players: { ...s.players, [pid]: { ...s.players[pid]!, resources: addResources(s.players[pid]!.resources, { grain }) } } };
      break;
    }
    case 'Mining': {
      // Take 2 ore per mountain hex adjacent to own buildings
      const graph = buildGraph();
      let ore = 0;
      for (const [hid, hex] of Object.entries(s.board.hexes)) {
        if (hex.terrain !== 'mountains') continue;
        const verts = graph.verticesOfHex[hid] ?? [];
        if (verts.some(v => s.board.vertices[v]?.playerId === pid)) ore += 2;
      }
      s = { ...s, players: { ...s.players, [pid]: { ...s.players[pid]!, resources: addResources(s.players[pid]!.resources, { ore }) } } };
      break;
    }
    case 'Medicine': {
      // Upgrade settlement to city: cost 1 grain + 2 ore (instead of 2+3)
      const targetVid = (params as any)?.vid as VertexId;
      if (targetVid && s.board.vertices[targetVid]?.type === 'settlement') {
        s = {
          ...s,
          players: { ...s.players, [pid]: { ...s.players[pid]!, resources: subtractResources(s.players[pid]!.resources, { grain: 1, ore: 2 }) } },
          board: { ...s.board, vertices: { ...s.board.vertices, [targetVid]: { type: 'city', playerId: pid, hasWall: false, metropolis: null } } },
        };
      }
      break;
    }
    case 'Smithing': {
      // Promote up to 2 knights for free
      break; // Handled by UI
    }
    case 'Merchant': {
      const targetHex = (params as any)?.hid as HexId;
      if (targetHex) {
        s = { ...s, board: { ...s.board, merchantHex: targetHex, merchantOwner: pid } };
      }
      break;
    }
    case 'Sabotage': {
      // Each player with >= current player's VP discards half
      const myVP = computeVP(s, pid);
      for (const [oppId, opp] of Object.entries(s.players)) {
        if (oppId === pid) continue;
        if (computeVP(s, oppId) >= myVP) {
          const total = Object.values(opp.resources).reduce((a, b) => a + b, 0);
          const discard = Math.floor(total / 2);
          if (discard > 0) {
            // Auto-discard lowest priority resources
            const newRes = autoDiscard(opp.resources, discard);
            s = { ...s, players: { ...s.players, [oppId]: { ...opp, resources: newRes } } };
          }
        }
      }
      break;
    }
    // Other cards handled with simplified effects
    default: break;
  }

  return checkWin(s);
}

function autoDiscard(resources: Resources, amount: number): Resources {
  const result = { ...resources };
  const keys: (keyof Resources)[] = ['cloth', 'coin', 'paper', 'brick', 'lumber', 'wool', 'grain', 'ore'];
  let remaining = amount;
  for (const k of keys) {
    while (remaining > 0 && (result[k] ?? 0) > 0) {
      result[k] = result[k]! - 1;
      remaining--;
    }
  }
  return result;
}
