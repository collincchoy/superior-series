import type {
  GameState,
  GameAction,
  PlayerId,
  VertexId,
  EdgeId,
  HexId,
  ImprovementTrack,
  Resources,
  TurnPhase,
} from "./types.js";
import { buildGraph } from "./board.js";
import {
  canPlaceSettlement,
  canPlaceCity,
  canPlaceRoad,
  canBuildRoad,
  canBuildSettlement,
  canBuildCity,
  canBuildCityWall,
  canRecruitKnight,
  canPromoteKnight,
  canActivateKnight,
  canMoveKnight,
  canRelocateDisplacedKnight,
  canImproveCity,
  hasResources,
  BUILD_COSTS,
} from "./rules.js";
import { computeVP } from "./game.js";

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Choose the best action for a bot player in the current game state.
 * Rule-based heuristic — no look-ahead.
 */
export function chooseBotAction(state: GameState, pid: PlayerId): GameAction {
  const graph = buildGraph();

  switch (state.phase) {
    case "SETUP_R1_SETTLEMENT":
      return chooseSetupSettlement(state, pid, graph);

    case "SETUP_R1_ROAD":
      return chooseSetupRoad(state, pid, graph, "settlement");

    case "SETUP_R2_CITY":
      return chooseSetupCity(state, pid, graph);

    case "SETUP_R2_ROAD":
      return chooseSetupRoad(state, pid, graph, "city");

    case "ROLL_DICE":
      return { type: "ROLL_DICE", pid };

    case "DISCARD":
      return chooseDiscard(state, pid);

    case "ROBBER_MOVE":
      return chooseRobberMove(state, pid, graph);

    case "ACTION":
      return chooseAction(state, pid, graph);

    case "KNIGHT_DISPLACE_RESPONSE":
      return chooseDisplacedMove(state, pid, graph);

    case "RESOLVE_PROGRESS_DRAW":
      return choosProgressDraw(state, pid);

    default:
      return { type: "END_TURN", pid };
  }
}

// ─── Setup Phases ─────────────────────────────────────────────────────────────

function chooseSetupSettlement(
  state: GameState,
  pid: PlayerId,
  graph: ReturnType<typeof buildGraph>,
): GameAction {
  const allVertices = Object.keys(graph.vertices) as VertexId[];

  // Score vertices by production value (number of pips on adjacent hexes)
  let bestVid: VertexId | null = null;
  let bestScore = -1;

  for (const vid of allVertices) {
    if (!canPlaceSettlement(state.board, graph, pid, vid, true)) continue;
    const score = scoreVertex(state, vid, graph);
    if (score > bestScore) {
      bestScore = score;
      bestVid = vid;
    }
  }

  if (bestVid) {
    return {
      type: "PLACE_BUILDING",
      pid,
      vid: bestVid,
      building: "settlement",
    };
  }

  // Fallback: first available
  for (const vid of allVertices) {
    if (canPlaceSettlement(state.board, graph, pid, vid, true)) {
      return { type: "PLACE_BUILDING", pid, vid, building: "settlement" };
    }
  }

  return { type: "END_TURN", pid };
}

function chooseSetupCity(
  state: GameState,
  pid: PlayerId,
  graph: ReturnType<typeof buildGraph>,
): GameAction {
  const allVertices = Object.keys(graph.vertices) as VertexId[];

  let bestVid: VertexId | null = null;
  let bestScore = -1;

  for (const vid of allVertices) {
    if (!canPlaceCity(state.board, graph, pid, vid)) continue;
    // Prefer vertices with different resource types from existing placements
    const score = scoreVertex(state, vid, graph, true);
    if (score > bestScore) {
      bestScore = score;
      bestVid = vid;
    }
  }

  if (bestVid) {
    return { type: "PLACE_BUILDING", pid, vid: bestVid, building: "city" };
  }

  for (const vid of allVertices) {
    if (canPlaceCity(state.board, graph, pid, vid)) {
      return { type: "PLACE_BUILDING", pid, vid, building: "city" };
    }
  }

  return { type: "END_TURN", pid };
}

function chooseSetupRoad(
  state: GameState,
  pid: PlayerId,
  graph: ReturnType<typeof buildGraph>,
  anchorType: "settlement" | "city",
): GameAction {
  // Find the most recently placed building of this type for this player
  const anchorVertex = Object.entries(state.board.vertices).find(
    ([, b]) => b?.playerId === pid && b.type === anchorType,
  )?.[0] as VertexId | undefined;

  if (!anchorVertex) {
    // Fallback: any free edge adjacent to our buildings
    return firstAvailableRoad(state, pid, graph);
  }

  // Prefer roads toward good vertices (high production score)
  let bestEdge: EdgeId | null = null;
  let bestScore = -1;

  for (const eid of graph.edgesOfVertex[anchorVertex] ?? []) {
    if (!canPlaceRoad(state.board, graph, pid, eid, anchorVertex)) continue;
    const [vA, vB] = graph.verticesOfEdge[eid]!;
    const otherVid = vA === anchorVertex ? vB! : vA!;
    const score = scoreVertex(state, otherVid, graph);
    if (score > bestScore) {
      bestScore = score;
      bestEdge = eid;
    }
  }

  if (bestEdge) {
    return { type: "PLACE_ROAD", pid, eid: bestEdge };
  }

  return firstAvailableRoad(state, pid, graph);
}

function firstAvailableRoad(
  state: GameState,
  pid: PlayerId,
  graph: ReturnType<typeof buildGraph>,
): GameAction {
  const allEdges = Object.keys(graph.edges) as EdgeId[];
  // Find any edge adjacent to player buildings/roads
  for (const eid of allEdges) {
    const [vA, vB] = graph.verticesOfEdge[eid]!;
    const anchorA =
      vA &&
      (state.board.vertices[vA]?.playerId === pid ||
        state.board.edges[eid]?.playerId === pid);
    if (anchorA && canPlaceRoad(state.board, graph, pid, eid, vA!)) {
      return { type: "PLACE_ROAD", pid, eid };
    }
    const anchorB = vB && state.board.vertices[vB]?.playerId === pid;
    if (anchorB && canPlaceRoad(state.board, graph, pid, eid, vB!)) {
      return { type: "PLACE_ROAD", pid, eid };
    }
  }
  return { type: "END_TURN", pid };
}

// ─── Score a vertex by production value ───────────────────────────────────────

const PIPS: Record<number, number> = {
  2: 1,
  12: 1,
  3: 2,
  11: 2,
  4: 3,
  10: 3,
  5: 4,
  9: 4,
  6: 5,
  8: 5,
};

function scoreVertex(
  state: GameState,
  vid: VertexId,
  graph: ReturnType<typeof buildGraph>,
  diversityBonus = false,
): number {
  let score = 0;
  const hexIds = graph.hexesOfVertex[vid] ?? [];
  const ownedTerrains = new Set<string>();

  // Get terrains from existing own buildings for diversity
  if (diversityBonus) {
    for (const [, b] of Object.entries(state.board.vertices)) {
      if (b?.playerId === "") continue; // doesn't matter for placeholder
    }
  }

  for (const hid of hexIds) {
    const hex = state.board.hexes[hid];
    if (!hex || hex.terrain === "desert" || hex.number === null) continue;
    score += PIPS[hex.number] ?? 0;
    if (diversityBonus && !ownedTerrains.has(hex.terrain)) {
      score += 2; // bonus for resource diversity
      ownedTerrains.add(hex.terrain);
    }
  }

  return score;
}

// ─── Discard ──────────────────────────────────────────────────────────────────

function chooseDiscard(state: GameState, pid: PlayerId): GameAction {
  const player = state.players[pid]!;
  const pending = state.pendingDiscard?.remaining[pid] ?? 0;
  if (pending === 0) return { type: "END_TURN", pid };

  // Discard lowest-priority resources first
  const priority: (keyof Resources)[] = [
    "cloth",
    "coin",
    "paper",
    "brick",
    "lumber",
    "wool",
    "grain",
    "ore",
  ];
  const cards: Partial<Resources> = {};
  let remaining = pending;

  for (const k of priority) {
    if (remaining <= 0) break;
    const have = player.resources[k] ?? 0;
    const discard = Math.min(have, remaining);
    if (discard > 0) {
      cards[k] = discard;
      remaining -= discard;
    }
  }

  return { type: "DISCARD", pid, cards };
}

// ─── Robber Move ──────────────────────────────────────────────────────────────

function chooseRobberMove(
  state: GameState,
  pid: PlayerId,
  graph: ReturnType<typeof buildGraph>,
): GameAction {
  // Target the player in the lead (not self), prioritizing hexes with high numbers
  const allHexIds = Object.keys(state.board.hexes) as HexId[];
  const leadPlayer = getLeadPlayer(state, pid);

  let bestHexId: HexId | null = null;
  let bestScore = -1;

  for (const hid of allHexIds) {
    const hex = state.board.hexes[hid];
    if (!hex || hex.hasRobber || hex.terrain === "desert") continue;

    // Check if lead player has a building here
    const hexVerts = graph.verticesOfHex[hid] ?? [];
    const leadIsHere = hexVerts.some(
      (v) => state.board.vertices[v]?.playerId === leadPlayer,
    );
    const selfIsHere = hexVerts.some(
      (v) => state.board.vertices[v]?.playerId === pid,
    );
    if (selfIsHere) continue;

    const score = (leadIsHere ? 100 : 0) + (PIPS[hex.number ?? 0] ?? 0);
    if (score > bestScore) {
      bestScore = score;
      bestHexId = hid;
    }
  }

  if (!bestHexId) {
    // Fallback: any non-self, non-desert hex
    for (const hid of allHexIds) {
      const hex = state.board.hexes[hid];
      if (hex && !hex.hasRobber && hex.terrain !== "desert") {
        const hexVerts = graph.verticesOfHex[hid] ?? [];
        if (!hexVerts.some((v) => state.board.vertices[v]?.playerId === pid)) {
          bestHexId = hid;
          break;
        }
      }
    }
    bestHexId = bestHexId ?? allHexIds[0]!;
  }

  // Find steal target
  const hexVerts = graph.verticesOfHex[bestHexId] ?? [];
  const stealFrom =
    hexVerts
      .map((v) => state.board.vertices[v]?.playerId)
      .find((p) => p && p !== pid) ?? null;

  return {
    type: "MOVE_ROBBER",
    pid,
    hid: bestHexId,
    stealFrom: stealFrom ?? null,
  };
}

// ─── Action Phase ─────────────────────────────────────────────────────────────

function chooseAction(
  state: GameState,
  pid: PlayerId,
  graph: ReturnType<typeof buildGraph>,
): GameAction {
  const player = state.players[pid]!;

  // 1. Build city (highest VP gain)
  if (canBuildCitySomewhere(state, player, graph)) {
    const vid = findCityTarget(state, player);
    if (vid) return { type: "BUILD_CITY", pid, vid };
  }

  // 2. City improvement (if have commodities)
  const improvTrack = chooseCityImprovement(state, player);
  if (improvTrack) {
    return { type: "IMPROVE_CITY", pid, track: improvTrack };
  }

  // 3. Build settlement (expansion)
  const settlementVid = findSettlementTarget(state, pid, graph);
  if (
    settlementVid &&
    canBuildSettlement(state.board, graph, player, settlementVid)
  ) {
    return { type: "BUILD_SETTLEMENT", pid, vid: settlementVid };
  }

  // 4. Build road (expand network toward good vertices)
  const roadEid = findRoadTarget(state, pid, graph);
  if (roadEid && canBuildRoad(state.board, graph, player, roadEid)) {
    return { type: "BUILD_ROAD", pid, eid: roadEid };
  }

  // 5. Recruit knight (if barbarians approaching)
  if (state.barbarian.position >= 4) {
    const knightVid = findKnightSpot(state, pid, graph);
    if (knightVid && canRecruitKnight(state.board, graph, player, knightVid)) {
      return { type: "RECRUIT_KNIGHT", pid, vid: knightVid };
    }
  }

  // 6. Activate knight (if barbarians imminent)
  if (state.barbarian.position >= 5) {
    const knightVid = findInactiveKnight(state, pid);
    if (knightVid && canActivateKnight(state.board, player, knightVid)) {
      return { type: "ACTIVATE_KNIGHT", pid, vid: knightVid };
    }
  }

  // 7. Trade toward city materials (ore, grain)
  const tradeAction = findTradeOpportunity(state, player, graph);
  if (tradeAction) return tradeAction;

  return { type: "END_TURN", pid };
}

function canBuildCitySomewhere(
  state: GameState,
  player: { id: PlayerId } & { resources: Resources; supply: any },
  graph: ReturnType<typeof buildGraph>,
): boolean {
  if (!hasResources(player as any, BUILD_COSTS.city)) return false;
  return Object.values(state.board.vertices).some(
    (b) => b?.type === "settlement" && b.playerId === player.id,
  );
}

function findCityTarget(
  state: GameState,
  player: { id: PlayerId },
): VertexId | null {
  const entry = Object.entries(state.board.vertices).find(
    ([, b]) => b?.type === "settlement" && b.playerId === player.id,
  );
  return entry ? (entry[0] as VertexId) : null;
}

function chooseCityImprovement(
  state: GameState,
  player: GameState["players"][string],
): ImprovementTrack | null {
  if (!player) return null;
  const tracks: ImprovementTrack[] = ["science", "trade", "politics"];
  for (const track of tracks) {
    if (canImproveCity(state.board, player, track)) return track;
  }
  return null;
}

function findSettlementTarget(
  state: GameState,
  pid: PlayerId,
  graph: ReturnType<typeof buildGraph>,
): VertexId | null {
  const allVertices = Object.keys(graph.vertices) as VertexId[];
  let bestVid: VertexId | null = null;
  let bestScore = -1;

  for (const vid of allVertices) {
    if (!canPlaceSettlement(state.board, graph, pid, vid, false)) continue;
    const score = scoreVertex(state, vid, graph);
    if (score > bestScore) {
      bestScore = score;
      bestVid = vid;
    }
  }
  return bestVid;
}

function findRoadTarget(
  state: GameState,
  pid: PlayerId,
  graph: ReturnType<typeof buildGraph>,
): EdgeId | null {
  const allEdges = Object.keys(graph.edges) as EdgeId[];
  let bestEdge: EdgeId | null = null;
  let bestScore = -1;

  for (const eid of allEdges) {
    if (state.board.edges[eid] !== null) continue;
    const [vA, vB] = graph.verticesOfEdge[eid]!;

    // Check connectivity
    const canBuild =
      Object.values(state.board.vertices).some((b) => b?.playerId === pid) ||
      Object.values(state.board.edges).some((r) => r?.playerId === pid);
    if (!canBuild) continue;

    const score = Math.max(
      scoreVertex(state, vA!, graph),
      scoreVertex(state, vB!, graph),
    );
    if (score > bestScore) {
      bestScore = score;
      bestEdge = eid;
    }
  }
  return bestEdge;
}

function findKnightSpot(
  state: GameState,
  pid: PlayerId,
  graph: ReturnType<typeof buildGraph>,
): VertexId | null {
  const allVertices = Object.keys(graph.vertices) as VertexId[];
  for (const vid of allVertices) {
    if (canRecruitKnight(state.board, graph, state.players[pid]!, vid))
      return vid;
  }
  return null;
}

function findInactiveKnight(state: GameState, pid: PlayerId): VertexId | null {
  for (const [vid, knight] of Object.entries(state.board.knights)) {
    if (knight?.playerId === pid && !knight.active) return vid as VertexId;
  }
  return null;
}

function findTradeOpportunity(
  state: GameState,
  player: GameState["players"][string],
  graph: ReturnType<typeof buildGraph>,
): GameAction | null {
  if (!player) return null;
  const pid = player.id;

  // Try to trade excess resources for ore or grain (for city building)
  const excessTypes: (keyof Resources)[] = [
    "brick",
    "lumber",
    "wool",
    "cloth",
    "coin",
    "paper",
  ];
  const wantTypes: (keyof Resources)[] = ["ore", "grain"];

  for (const giveType of excessTypes) {
    const have = player.resources[giveType] ?? 0;
    if (have < 4) continue;

    for (const getType of wantTypes) {
      const give: Partial<Resources> = { [giveType]: 4 };
      const get: Partial<Resources> = { [getType]: 1 };
      return { type: "TRADE_BANK", pid, give, get };
    }
  }
  return null;
}

// ─── Displaced knight ─────────────────────────────────────────────────────────

function chooseDisplacedMove(
  state: GameState,
  pid: PlayerId,
  graph: ReturnType<typeof buildGraph>,
): GameAction {
  const pending = state.pendingDisplace;
  if (!pending || pending.displacedPlayerId !== pid) {
    return { type: "DISPLACED_MOVE", pid, from: "" as VertexId, to: null };
  }

  const from = pending.displacedKnightVertex;
  const allVertices = Object.keys(graph.vertices) as VertexId[];

  // Find a safe spot to move the displaced knight
  for (const to of allVertices) {
    if (canRelocateDisplacedKnight(state.board, graph, pid, from, to)) {
      return { type: "DISPLACED_MOVE", pid, from, to };
    }
  }

  // Can't move — return to supply
  return { type: "DISPLACED_MOVE", pid, from, to: null };
}

// ─── Progress card draw ───────────────────────────────────────────────────────

function choosProgressDraw(state: GameState, pid: PlayerId): GameAction {
  const pending = state.pendingProgressDraw;
  if (!pending || !pending.remaining.includes(pid)) {
    return { type: "END_TURN", pid };
  }
  return { type: "DRAW_PROGRESS", pid, track: pending.track };
}

// ─── Utility: find lead player ────────────────────────────────────────────────

function getLeadPlayer(state: GameState, excludePid: PlayerId): PlayerId {
  let bestPid = excludePid;
  let bestVP = -1;

  for (const pid of state.playerOrder) {
    if (pid === excludePid) continue;
    const vp = computeVP(state, pid);
    if (vp > bestVP) {
      bestVP = vp;
      bestPid = pid;
    }
  }

  return bestPid;
}
