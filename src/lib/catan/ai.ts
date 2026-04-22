import type {
  GameState,
  GameAction,
  PlayerId,
  VertexId,
  EdgeId,
  HexId,
  ImprovementTrack,
  Resources,
  PlayerSupply,
  Player,
  ProgressCard,
  ProgressCardName,
  KnightStrength,
  CommodityType,
  ResourceType,
} from "./types.js";
import { buildGraph, type CatanGraph } from "./board.js";
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
  canDisplaceKnight,
  canChaseRobber,
  canImproveCity,
  canPlaceFreeRoad,
  canPromoteFreeKnight,
  hasResources,
  isOnPlayerNetwork,
  isOpenRoad,
  bestKnightUpTo,
  hasKnightUpTo,
  getBankRatio,
  canReachVertex,
  playerHasCity,
} from "./rules.js";
import {
  BUILD_COSTS,
  TRACK_COMMODITY,
  rollProductionDie,
} from "./constants.js";
import { computeVP } from "./game.js";

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Choose the best action for a bot player in the current game state.
 * Rule-based heuristic — no look-ahead.
 */
export function chooseBotAction(state: GameState, pid: PlayerId): GameAction {
  const graph = buildGraph();

  if (state.pendingVpCardAnnouncement?.pid === pid) {
    return { type: "ACKNOWLEDGE_VP_CARD", pid };
  }

  switch (state.phase) {
    case "SETUP_R1_SETTLEMENT":
      return chooseSetupSettlement(state, pid, graph);

    case "SETUP_R1_ROAD":
      return chooseSetupRoad(state, pid, graph, "settlement");

    case "SETUP_R2_CITY":
      return chooseSetupCity(state, pid, graph);

    case "SETUP_R2_ROAD":
      return chooseSetupRoad(state, pid, graph, "city");

    case "ROLL_DICE": {
      const alchemy = maybePlayAlchemy(state, pid, graph);
      if (alchemy) return alchemy;
      return { type: "ROLL_DICE", pid };
    }

    case "DISCARD":
      return chooseDiscard(state, pid, graph);

    case "DISCARD_PROGRESS":
      return chooseProgressDiscard(state, pid);

    case "ROBBER_MOVE":
      return chooseRobberMove(state, pid, graph);

    case "ACTION":
      if (state.pendingTradeOffer?.targetPids.includes(pid))
        return chooseBotTradeResponse(state, pid);
      if (state.pendingTradeOffer?.initiatorPid === pid) {
        // Defensive: runBotTurns routes to targets first in real play, but if
        // the host happens to poll us, cancel so the turn can progress.
        const to = state.pendingTradeOffer.targetPids[0];
        if (to) return { type: "TRADE_CANCEL", from: pid, to };
      }
      if (state.pendingCommercialHarbor?.remainingPids.includes(pid))
        return chooseBotCommercialHarborResponse(state, pid);
      if (state.pendingTreason?.pid === pid)
        return chooseBotTreasonPlacement(state, pid, graph);
      return chooseAction(state, pid, graph);

    case "KNIGHT_DISPLACE_RESPONSE":
      return chooseDisplacedMove(state, pid, graph);

    case "RESOLVE_PROGRESS_DRAW":
      return chooseProgressDraw(state, pid);

    case "SCIENCE_SELECT_RESOURCE":
      return chooseScienceBonus(state, pid, graph);

    default:
      return { type: "END_TURN", pid };
  }
}

// ─── Bot Goal ────────────────────────────────────────────────────────────────
// The bot's top-level intent for the current turn. Drives discard/trade/science
// choices and, implicitly, the action ladder.

type GoalKind =
  | "win"
  | "defendBarbarian"
  | "metropolis"
  | "buildCity"
  | "improveCity"
  | "buildSettlement"
  | "buildRoad"
  | "recruitKnight"
  | "idle";

interface BotGoal {
  kind: GoalKind;
  /** For metropolis / improveCity goals */
  track?: ImprovementTrack;
  /** Resources still needed to reach the goal */
  shortfall: Partial<Resources>;
}

function computeBotGoal(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): BotGoal {
  const player = state.players[pid];
  if (!player) return { kind: "idle", shortfall: {} };

  // 1. Within 2 VP of winning → try to close out via buildCity/improve.
  const vp = computeVP(state, pid);
  if (vp >= 12) {
    // just one more VP gets us to 13.
    return { kind: "win", shortfall: {} };
  }

  // 2. Barbarians about to attack and we'd contribute to a loss.
  if (state.barbarian.position >= 5) {
    const gap = barbarianGap(state);
    if (gap > 0) {
      return { kind: "defendBarbarian", shortfall: { ore: 1, wool: 1 } };
    }
  }

  // 3. Metropolis race: someone else just reached L4 on a track we can contest.
  const metroTrack = pickMetropolisTrack(state, pid);
  if (metroTrack) {
    const nextLevel = player.improvements[metroTrack] + 1;
    const commodity = TRACK_COMMODITY[metroTrack];
    const owned = player.resources[commodity] ?? 0;
    const need = Math.max(0, nextLevel - owned);
    return {
      kind: "metropolis",
      track: metroTrack,
      shortfall: need > 0 ? { [commodity]: need } : {},
    };
  }

  // 4. Build city if we have a settlement on the board.
  if (
    player.supply.cities > 0 &&
    Object.values(state.board.vertices).some(
      (b) => b?.type === "settlement" && b.playerId === pid,
    )
  ) {
    const shortfall = computeShortfall(player.resources, BUILD_COSTS.city);
    return { kind: "buildCity", shortfall };
  }

  // 5. Improve a city (pick best track by stockpile / politics-3 gate).
  const impTrack = resolveImprovementTrack(state, pid);
  if (impTrack) {
    const nextLevel = player.improvements[impTrack] + 1;
    const commodity = TRACK_COMMODITY[impTrack];
    const owned = player.resources[commodity] ?? 0;
    const need = Math.max(0, nextLevel - owned);
    return {
      kind: "improveCity",
      track: impTrack,
      shortfall: need > 0 ? { [commodity]: need } : {},
    };
  }

  // 6. Build a settlement if a spot is reachable from our network.
  if (
    player.supply.settlements > 0 &&
    findSettlementTarget(state, pid, graph) !== null
  ) {
    const shortfall = computeShortfall(
      player.resources,
      BUILD_COSTS.settlement,
    );
    return { kind: "buildSettlement", shortfall };
  }

  // 7. Build a road toward something.
  if (player.supply.roads > 0) {
    const shortfall = computeShortfall(player.resources, BUILD_COSTS.road);
    return { kind: "buildRoad", shortfall };
  }

  return { kind: "idle", shortfall: {} };
}

function computeShortfall(
  have: Resources,
  cost: Partial<Resources>,
): Partial<Resources> {
  const out: Partial<Resources> = {};
  for (const [k, v] of Object.entries(cost) as [keyof Resources, number][]) {
    const deficit = Math.max(0, (v ?? 0) - (have[k] ?? 0));
    if (deficit > 0) out[k] = deficit;
  }
  return out;
}

// ─── Setup Phases ─────────────────────────────────────────────────────────────

function chooseSetupSettlement(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): GameAction {
  const allVertices = Object.keys(graph.vertices) as VertexId[];

  let bestVid: VertexId | null = null;
  let bestScore = -1;

  for (const vid of allVertices) {
    if (!canPlaceSettlement(state.board, graph, pid, vid, true)) continue;
    const score = scoreVertex(state, vid, graph, pid);
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
  return { type: "END_TURN", pid };
}

function chooseSetupCity(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): GameAction {
  const allVertices = Object.keys(graph.vertices) as VertexId[];

  // Detect round-1 placement's terrain mix to decide the complementary basket.
  const { terrains: r1Terrains, pips: r1Pips } = round1HexStats(state, pid, graph);
  // If the R1 settlement is a strong city-strategy pick (ore and/or grain with
  // high pips), the second placement should shore up expansion resources
  // (brick+lumber+wool). Otherwise chase ore+grain for the city path.
  const cityLean =
    (r1Terrains.has("mountains") ? 1 : 0) +
    (r1Terrains.has("fields") ? 1 : 0) >=
    1 && r1Pips >= 8;
  const preferredBaskets: Record<string, number> = cityLean
    ? { hills: 3, forest: 3, pasture: 2 }
    : { mountains: 3, fields: 3 };

  let bestVid: VertexId | null = null;
  let bestScore = -1;

  for (const vid of allVertices) {
    if (!canPlaceCity(state.board, graph, pid, vid)) continue;
    let score = scoreVertex(state, vid, graph, pid);
    for (const hid of graph.hexesOfVertex[vid] ?? []) {
      const hex = state.board.hexes[hid];
      if (!hex || hex.terrain === "desert") continue;
      const mult = preferredBaskets[hex.terrain] ?? 0;
      score += mult * (PIPS[hex.number ?? 0] ?? 0);
    }
    if (score > bestScore) {
      bestScore = score;
      bestVid = vid;
    }
  }

  if (bestVid) {
    return { type: "PLACE_BUILDING", pid, vid: bestVid, building: "city" };
  }
  return { type: "END_TURN", pid };
}

function round1HexStats(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): { terrains: Set<string>; pips: number } {
  const terrains = new Set<string>();
  let pips = 0;
  for (const [vid, b] of Object.entries(state.board.vertices)) {
    if (b?.playerId !== pid) continue;
    for (const hid of graph.hexesOfVertex[vid as VertexId] ?? []) {
      const hex = state.board.hexes[hid];
      if (hex && hex.terrain !== "desert") terrains.add(hex.terrain);
      if (hex?.number) pips += PIPS[hex.number] ?? 0;
    }
  }
  return { terrains, pips };
}

function chooseSetupRoad(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
  anchorType: "settlement" | "city",
): GameAction {
  const anchorVertex = Object.entries(state.board.vertices).find(
    ([, b]) => b?.playerId === pid && b.type === anchorType,
  )?.[0] as VertexId | undefined;

  if (!anchorVertex) {
    return firstAvailableRoad(state, pid, graph);
  }

  let bestEdge: EdgeId | null = null;
  let bestScore = -1;

  for (const eid of graph.edgesOfVertex[anchorVertex] ?? []) {
    if (!canPlaceRoad(state.board, graph, pid, eid, anchorVertex)) continue;
    const [vA, vB] = graph.verticesOfEdge[eid]!;
    const otherVid = vA === anchorVertex ? vB! : vA!;
    const score = scoreVertex(state, otherVid, graph, pid);
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
  graph: CatanGraph,
): GameAction {
  const allEdges = Object.keys(graph.edges) as EdgeId[];
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

// ─── Scoring a vertex ────────────────────────────────────────────────────────

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

/**
 * Score a candidate vertex for placement.
 * - Primary: sum of production pips on adjacent hexes.
 * - Bonus: diversity of resource types relative to the bot's existing holdings.
 * - Bonus: adjacent 2:1 specific harbor on a matching high-pip hex;
 *          smaller bonus for adjacent 3:1 generic harbor.
 */
function scoreVertex(
  state: GameState,
  vid: VertexId,
  graph: CatanGraph,
  pid?: PlayerId,
): number {
  let score = 0;
  const hexIds = graph.hexesOfVertex[vid] ?? [];

  // Compute terrains already represented in this bot's holdings.
  const ownedTerrains = new Set<string>();
  if (pid) {
    for (const [ownedVid, b] of Object.entries(state.board.vertices)) {
      if (b?.playerId !== pid) continue;
      for (const hid of graph.hexesOfVertex[ownedVid as VertexId] ?? []) {
        const hex = state.board.hexes[hid];
        if (hex && hex.terrain !== "desert") ownedTerrains.add(hex.terrain);
      }
    }
  }

  const newTerrains = new Set<string>();
  let pipsSum = 0;
  for (const hid of hexIds) {
    const hex = state.board.hexes[hid];
    if (!hex || hex.terrain === "desert" || hex.number === null) continue;
    const p = PIPS[hex.number] ?? 0;
    pipsSum += p;
    score += p;
    if (pid && !ownedTerrains.has(hex.terrain)) newTerrains.add(hex.terrain);
  }

  // Diversity bonus: +2 per new terrain (vs. existing holdings).
  score += newTerrains.size * 2;

  // Harbor bonus.
  for (const harbor of state.board.harbors) {
    if (harbor.vertices[0] !== vid && harbor.vertices[1] !== vid) continue;
    if (harbor.type === "generic") {
      score += 1;
    } else {
      // Specific 2:1 harbor; huge if we touch a matching terrain with pips.
      const matchTerrain = resourceToTerrain(harbor.type);
      let matchPips = 0;
      for (const hid of hexIds) {
        const hex = state.board.hexes[hid];
        if (hex?.terrain === matchTerrain) {
          matchPips += PIPS[hex.number ?? 0] ?? 0;
        }
      }
      score += matchPips > 0 ? 2 + matchPips : 1;
    }
    break;
  }

  // Penalty: blocked hex (robber) cuts pip value.
  // (Handled implicitly: robber-hexes still score pips here; scoring is used
  // at setup where robber hasn't been placed yet and mid-game expansion.)
  if (pipsSum === 0 && newTerrains.size === 0) return 0;

  return score;
}

function resourceToTerrain(r: ResourceType) {
  switch (r) {
    case "brick":
      return "hills";
    case "lumber":
      return "forest";
    case "ore":
      return "mountains";
    case "grain":
      return "fields";
    case "wool":
      return "pasture";
  }
}

// ─── Discard ──────────────────────────────────────────────────────────────────

function chooseDiscard(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): GameAction {
  const player = state.players[pid]!;
  const pending = state.pendingDiscard?.remaining[pid] ?? 0;
  if (pending === 0) return { type: "END_TURN", pid };

  const goal = computeBotGoal(state, pid, graph);
  const keep = new Set<keyof Resources>(
    Object.keys(goal.shortfall) as (keyof Resources)[],
  );
  // Also keep a buffer of known-useful resources for the turn's likely follow-up.
  if (goal.kind === "buildCity") {
    keep.add("ore");
    keep.add("grain");
  }
  if (goal.kind === "buildSettlement") {
    keep.add("brick");
    keep.add("lumber");
    keep.add("wool");
    keep.add("grain");
  }
  if (goal.kind === "buildRoad") {
    keep.add("brick");
    keep.add("lumber");
  }
  if (goal.kind === "metropolis" && goal.track) {
    keep.add(TRACK_COMMODITY[goal.track]);
  }
  if (goal.kind === "defendBarbarian") {
    keep.add("ore");
    keep.add("wool");
    keep.add("grain");
  }

  // Base priority: discard least valuable, least needed first.
  const priority: (keyof Resources)[] = [
    "cloth",
    "coin",
    "paper",
    "wool",
    "brick",
    "lumber",
    "grain",
    "ore",
  ];

  // Two-pass: first drop resources NOT in `keep`, then fall back to keep set.
  const cards: Partial<Resources> = {};
  let remaining = pending;
  const workingAmounts: Partial<Resources> = { ...player.resources };

  const dropFrom = (list: (keyof Resources)[]) => {
    for (const k of list) {
      if (remaining <= 0) break;
      const have = workingAmounts[k] ?? 0;
      if (have <= 0) continue;
      const take = Math.min(have, remaining);
      cards[k] = (cards[k] ?? 0) + take;
      workingAmounts[k] = have - take;
      remaining -= take;
    }
  };

  const pool1 = priority.filter((k) => !keep.has(k));
  dropFrom(pool1);
  if (remaining > 0) {
    const pool2 = priority.filter((k) => keep.has(k));
    dropFrom(pool2);
  }

  return { type: "DISCARD", pid, cards };
}

// ─── Robber Move ──────────────────────────────────────────────────────────────

function chooseRobberMove(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): GameAction {
  const allHexIds = Object.keys(state.board.hexes) as HexId[];
  const leadPlayer = getLeadPlayer(state, pid);

  let bestHexId: HexId | null = null;
  let bestScore = -1;

  for (const hid of allHexIds) {
    const hex = state.board.hexes[hid];
    if (!hex || hex.hasRobber || hex.terrain === "desert") continue;

    const hexVerts = graph.verticesOfHex[hid] ?? [];
    const selfIsHere = hexVerts.some(
      (v) => state.board.vertices[v]?.playerId === pid,
    );
    if (selfIsHere) continue;

    const leadIsHere = hexVerts.some(
      (v) => state.board.vertices[v]?.playerId === leadPlayer,
    );

    // Only reward steal potential on hexes where at least one opponent has cards.
    let stealPotential = 0;
    for (const v of hexVerts) {
      const b = state.board.vertices[v];
      if (!b || b.playerId === pid) continue;
      const opp = state.players[b.playerId];
      if (!opp) continue;
      const oppCards = Object.values(opp.resources).reduce((a, c) => a + c, 0);
      if (oppCards > 0) stealPotential += 1;
    }

    const score =
      (leadIsHere ? 100 : 0) +
      (PIPS[hex.number ?? 0] ?? 0) +
      stealPotential * 3;
    if (score > bestScore) {
      bestScore = score;
      bestHexId = hid;
    }
  }

  if (!bestHexId) {
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

  // Pick a steal target that actually has cards to steal.
  const hexVerts = graph.verticesOfHex[bestHexId] ?? [];
  let stealFrom: PlayerId | null = null;
  let bestCardCount = -1;
  for (const v of hexVerts) {
    const b = state.board.vertices[v];
    if (!b || b.playerId === pid) continue;
    const opp = state.players[b.playerId];
    if (!opp) continue;
    const count = Object.values(opp.resources).reduce((a, c) => a + c, 0);
    if (count > bestCardCount) {
      bestCardCount = count;
      stealFrom = b.playerId;
    }
  }

  return {
    type: "MOVE_ROBBER",
    pid,
    hid: bestHexId,
    stealFrom: bestCardCount > 0 ? stealFrom : null,
  };
}

// ─── Trade Response ───────────────────────────────────────────────────────────

const TRADE_WEIGHTS: Record<string, number> = {
  ore: 3,
  grain: 2.5,
  cloth: 2.5,
  coin: 2.5,
  paper: 2.5,
  brick: 2,
  lumber: 2,
  wool: 1.5,
};

function scoreResources(r: Partial<Resources>): number {
  return Object.entries(r).reduce(
    (total, [k, v]) => total + (TRADE_WEIGHTS[k] ?? 1) * (v ?? 0),
    0,
  );
}

function chooseBotTradeResponse(
  state: GameState,
  pid: PlayerId,
): GameAction {
  const pending = state.pendingTradeOffer!;
  const bot = state.players[pid]!;
  for (const [k, v] of Object.entries(pending.want)) {
    if ((bot.resources[k as keyof Resources] ?? 0) < (v ?? 0)) {
      return { type: "TRADE_REJECT", from: pending.initiatorPid, to: pid };
    }
  }
  const receive = scoreResources(pending.offer);
  const give = scoreResources(pending.want);
  return receive >= give * 0.75
    ? { type: "TRADE_ACCEPT", from: pending.initiatorPid, to: pid }
    : { type: "TRADE_REJECT", from: pending.initiatorPid, to: pid };
}

function chooseBotCommercialHarborResponse(
  state: GameState,
  pid: PlayerId,
): GameAction {
  const bot = state.players[pid]!;
  const commodities = (["cloth", "coin", "paper"] as const).filter(
    (c) => (bot.resources[c] ?? 0) >= 1,
  );
  if (commodities.length > 0) {
    const best = commodities.reduce((a, b) =>
      (bot.resources[a] ?? 0) >= (bot.resources[b] ?? 0) ? a : b,
    );
    return { type: "PROGRESS_RESPOND_COMMERCIAL_HARBOR", pid, commodity: best };
  }
  return { type: "PROGRESS_RESPOND_COMMERCIAL_HARBOR", pid, commodity: undefined };
}

function chooseBotTreasonPlacement(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): GameAction {
  const pending = state.pendingTreason!;
  const me = state.players[pid]!;
  const strength = bestKnightUpTo(me, pending.maxStrength);
  if (!strength) return { type: "PROGRESS_SKIP_TREASON", pid };
  const vid = Object.keys(graph.vertices).find(
    (v) =>
      !state.board.vertices[v as VertexId] &&
      !state.board.knights[v as VertexId] &&
      isOnPlayerNetwork(state.board, graph, pid, v as VertexId),
  ) as VertexId | undefined;
  if (!vid) return { type: "PROGRESS_SKIP_TREASON", pid };
  return { type: "PROGRESS_PLACE_TREASON_KNIGHT", pid, vid, strength };
}

// ─── Action Phase ─────────────────────────────────────────────────────────────

function chooseAction(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): GameAction {
  // Sub-state: finish RoadBuilding / Diplomacy free-road placement.
  if (state.pendingFreeRoads?.pid === pid) {
    return handlePendingFreeRoads(state, pid, graph);
  }
  // Sub-state: finish Smithing free promotion.
  if (state.pendingKnightPromotions?.pid === pid) {
    return handlePendingKnightPromotions(state, pid);
  }

  const player = state.players[pid]!;

  // A. Try to play a high-value progress card (free-value cards first).
  const cardAction = pickProgressCardAction(state, pid, graph);
  if (cardAction) return cardAction;

  // B. Defense gate: if barbarian ship imminent and we're underfit, scramble.
  if (state.barbarian.position >= 5) {
    const def = emergencyDefenseAction(state, pid, graph);
    if (def) return def;
  }

  // C. Build city (highest VP gain).
  if (canBuildCitySomewhere(state, player)) {
    const vid = findCityTarget(state, player, graph);
    if (vid) return { type: "BUILD_CITY", pid, vid };
  }

  // D. City improvement.
  const improvTrack = pickImprovementTrackToBuy(state, pid);
  if (improvTrack) {
    return { type: "IMPROVE_CITY", pid, track: improvTrack };
  }

  // E. Build city wall if barbarian track is heating up.
  if (state.barbarian.position >= 4) {
    const wallVid = findCityWallTarget(state, pid, graph);
    if (wallVid && canBuildCityWall(state.board, player, wallVid)) {
      return { type: "BUILD_CITY_WALL", pid, vid: wallVid };
    }
  }

  // F. Build settlement (expansion).
  const settlementVid = findSettlementTarget(state, pid, graph);
  if (
    settlementVid &&
    canBuildSettlement(state.board, graph, player, settlementVid)
  ) {
    return { type: "BUILD_SETTLEMENT", pid, vid: settlementVid };
  }

  // G. Build road toward a future settlement (BFS).
  const roadEid = findRoadToBestTarget(state, pid, graph);
  if (roadEid && canBuildRoad(state.board, graph, player, roadEid)) {
    return { type: "BUILD_ROAD", pid, eid: roadEid };
  }

  // H. Knight defense ladder.
  if (state.barbarian.position >= 4) {
    const knightVid = findKnightSpot(state, pid, graph);
    if (knightVid && canRecruitKnight(state.board, graph, player, knightVid)) {
      return { type: "RECRUIT_KNIGHT", pid, vid: knightVid };
    }
  }
  if (state.barbarian.position >= 3) {
    const knightVid = findPromotableKnight(state, pid);
    if (knightVid && canPromoteKnight(state.board, player, knightVid)) {
      return { type: "PROMOTE_KNIGHT", pid, vid: knightVid };
    }
  }
  if (state.barbarian.position >= 5) {
    const knightVid = findInactiveKnight(state, pid);
    if (knightVid && canActivateKnight(state.board, player, knightVid)) {
      return { type: "ACTIVATE_KNIGHT", pid, vid: knightVid };
    }
  }

  // I. Knight offense: chase robber / displace blocking knights / reposition.
  const chase = chooseChaseRobber(state, pid, graph);
  if (chase) return chase;
  const displace = chooseDisplaceKnight(state, pid, graph);
  if (displace) return displace;
  const moveKnight = chooseRepositionKnight(state, pid, graph);
  if (moveKnight) return moveKnight;

  // J. Trade toward the current goal at the best available ratio.
  const trade = findTradeOpportunity(state, pid, graph);
  if (trade) return trade;

  // K. Player-to-player trade (Phase 4). Guarded against re-emission loops
  //    with resource-hash cache: we only offer a fresh trade when our hand
  //    has actually changed since our last attempt.
  const offer = findTradeOffer(state, pid, graph);
  if (offer) return offer;

  return { type: "END_TURN", pid };
}

// Tracks the last resource-state hash at which each bot attempted a
// TRADE_OFFER. We skip re-emitting until the bot's hand actually changes,
// which prevents infinite "offer → cancel → offer" loops when opponents
// can't respond (e.g. humans who haven't clicked yet, or in tests that
// bypass `runBotTurns`'s target-first routing).
const tradeOfferAttemptHash = new Map<PlayerId, string>();

function resourceHash(r: Resources): string {
  return [r.brick, r.lumber, r.ore, r.grain, r.wool, r.cloth, r.coin, r.paper].join(
    ",",
  );
}

// ─── Pending sub-state handlers ──────────────────────────────────────────────

function handlePendingFreeRoads(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): GameAction {
  const player = state.players[pid]!;
  const eid = findRoadToBestTarget(state, pid, graph);
  if (eid && canPlaceFreeRoad(state.board, graph, player, eid)) {
    return { type: "PROGRESS_PLACE_FREE_ROAD", pid, eid };
  }
  // No useful road — fall back to any legal free road so we don't waste the card.
  const allEdges = Object.keys(graph.edges) as EdgeId[];
  for (const e of allEdges) {
    if (canPlaceFreeRoad(state.board, graph, player, e)) {
      return { type: "PROGRESS_PLACE_FREE_ROAD", pid, eid: e };
    }
  }
  return { type: "PROGRESS_SKIP_FREE_ROADS", pid };
}

function handlePendingKnightPromotions(
  state: GameState,
  pid: PlayerId,
): GameAction {
  const player = state.players[pid]!;
  // Promote strongest-first (strength 2 → mighty when gated; else basic → strong).
  const candidates = Object.entries(state.board.knights)
    .filter(([, k]) => k?.playerId === pid && k.strength < 3)
    .map(([vid, k]) => ({ vid: vid as VertexId, strength: k!.strength }));
  candidates.sort((a, b) => b.strength - a.strength);
  for (const c of candidates) {
    if (canPromoteFreeKnight(state.board, player, c.vid)) {
      return { type: "PROGRESS_PROMOTE_FREE_KNIGHT", pid, vid: c.vid };
    }
  }
  return { type: "PROGRESS_SKIP_FREE_PROMOTIONS", pid };
}

// ─── Defense math ────────────────────────────────────────────────────────────

function barbarianStrength(state: GameState): number {
  return Object.values(state.board.vertices).filter(
    (b) => b?.type === "city",
  ).length;
}

function totalActiveKnightStrength(state: GameState): number {
  let total = 0;
  for (const k of Object.values(state.board.knights)) {
    if (k?.active) total += k.strength;
  }
  return total;
}

function barbarianGap(state: GameState): number {
  return Math.max(0, barbarianStrength(state) - totalActiveKnightStrength(state));
}

function emergencyDefenseAction(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): GameAction | null {
  const player = state.players[pid]!;
  // 1. Activate any inactive knight we own (cheap: 1 grain).
  for (const [vid, k] of Object.entries(state.board.knights)) {
    if (k?.playerId === pid && !k.active) {
      if (canActivateKnight(state.board, player, vid as VertexId)) {
        return { type: "ACTIVATE_KNIGHT", pid, vid: vid as VertexId };
      }
    }
  }
  // 2. Promote an existing knight if affordable.
  for (const [vid, k] of Object.entries(state.board.knights)) {
    if (k?.playerId === pid && k.strength < 3) {
      if (canPromoteKnight(state.board, player, vid as VertexId)) {
        return { type: "PROMOTE_KNIGHT", pid, vid: vid as VertexId };
      }
    }
  }
  // 3. Recruit a new knight if affordable + reachable.
  const spot = findKnightSpot(state, pid, graph);
  if (spot && canRecruitKnight(state.board, graph, player, spot)) {
    return { type: "RECRUIT_KNIGHT", pid, vid: spot };
  }
  return null;
}

// ─── City / improvement / settlement helpers ─────────────────────────────────

function canBuildCitySomewhere(
  state: GameState,
  player: { id: PlayerId; resources: Resources; supply: PlayerSupply },
): boolean {
  if (!hasResources(player as Player, BUILD_COSTS.city)) return false;
  if (player.supply.cities <= 0) return false;
  return Object.values(state.board.vertices).some(
    (b) => b?.type === "settlement" && b.playerId === player.id,
  );
}

function findCityTarget(
  state: GameState,
  player: { id: PlayerId },
  graph: CatanGraph,
): VertexId | null {
  const entries = Object.entries(state.board.vertices)
    .filter(([, b]) => b?.type === "settlement" && b.playerId === player.id)
    .map(([vid]) => vid as VertexId);
  if (entries.length === 0) return null;
  entries.sort((a, b) => scoreVertex(state, b, graph) - scoreVertex(state, a, graph));
  return entries[0]!;
}

/**
 * Pick a track to improve this action-phase.
 * Priorities:
 *   1. Metropolis race — if any opponent already holds temp metropolis on a track
 *      we can challenge, or if we're next at level 4/5.
 *   2. Politics L3 when we have un-promoted knights (to unlock Mighty).
 *   3. Otherwise, lowest-level track that we can actually afford.
 */
function pickImprovementTrackToBuy(
  state: GameState,
  pid: PlayerId,
): ImprovementTrack | null {
  const player = state.players[pid]!;
  if (!playerHasCity(state.board, pid)) return null;

  const tracks: ImprovementTrack[] = ["science", "trade", "politics"];

  // 1. Metropolis push: if we're at L3 and could reach L4/L5 affordably.
  const metroChoice = pickMetropolisTrack(state, pid);
  if (metroChoice && canImproveCity(state.board, player, metroChoice)) {
    return metroChoice;
  }

  // 2. Unlock Mighty: if we have a strength-2 knight and politics L<3.
  const hasStrong = Object.values(state.board.knights).some(
    (k) => k?.playerId === pid && k.strength === 2,
  );
  if (
    hasStrong &&
    player.improvements.politics < 3 &&
    canImproveCity(state.board, player, "politics")
  ) {
    return "politics";
  }

  // 3. Take cheapest affordable improvement (lowest commodity cost).
  const affordable = tracks.filter((t) =>
    canImproveCity(state.board, player, t),
  );
  if (affordable.length === 0) return null;
  affordable.sort((a, b) => player.improvements[a] - player.improvements[b]);
  return affordable[0]!;
}

function resolveImprovementTrack(
  state: GameState,
  pid: PlayerId,
): ImprovementTrack | null {
  // Used by BotGoal when picking improve-city goal. Same priorities but
  // returns the most aspirational track even if we can't afford yet.
  const player = state.players[pid]!;
  if (!playerHasCity(state.board, pid)) return null;
  const metro = pickMetropolisTrack(state, pid);
  if (metro && player.improvements[metro] < 5) return metro;
  const tracks: ImprovementTrack[] = ["science", "trade", "politics"];
  const opts = tracks.filter((t) => player.improvements[t] < 5);
  if (opts.length === 0) return null;
  opts.sort(
    (a, b) => player.improvements[a] - player.improvements[b],
  );
  return opts[0]!;
}

/**
 * Return a track we should push toward metropolis (L4/L5), or null.
 * Cases:
 *  - We're at L4 and someone else owns the temp metropolis → rush L5.
 *  - We're at L3 and no one owns metropolis → push L4 for 2 VP.
 *  - Another player is at L4 on a track we're close on → push to block.
 */
function pickMetropolisTrack(
  state: GameState,
  pid: PlayerId,
): ImprovementTrack | null {
  const player = state.players[pid]!;
  const tracks: ImprovementTrack[] = ["science", "trade", "politics"];

  // Case: we're close to permanent metropolis.
  for (const t of tracks) {
    if (
      player.improvements[t] === 4 &&
      state.metropolisOwner[t] !== pid // either null or opponent — push L5.
    ) {
      return t;
    }
  }
  for (const t of tracks) {
    if (player.improvements[t] === 3 && state.metropolisOwner[t] === null) {
      return t;
    }
  }
  return null;
}

function findSettlementTarget(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): VertexId | null {
  const allVertices = Object.keys(graph.vertices) as VertexId[];
  let bestVid: VertexId | null = null;
  let bestScore = -1;

  for (const vid of allVertices) {
    if (!canPlaceSettlement(state.board, graph, pid, vid, false)) continue;
    const score = scoreVertex(state, vid, graph, pid);
    if (score > bestScore) {
      bestScore = score;
      bestVid = vid;
    }
  }
  return bestVid;
}

/**
 * Find the next road edge to build toward the best unclaimed vertex.
 * Proper connectivity: the edge must have at least one endpoint that is on the
 * player's network (not blocked by an opponent piece), and the player must not
 * yet own a road at that edge.
 *
 * Strategy:
 *   1. Enumerate unclaimed vertices ranked by score; for each, BFS from the
 *      player's network along empty edges and return the first edge on that path.
 *   2. Fallback: any legal connected edge adjacent to a high-score open vertex.
 */
function findRoadToBestTarget(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): EdgeId | null {
  const player = state.players[pid]!;
  const ownedVerts = getPlayerNetworkVertices(state, pid, graph);
  if (ownedVerts.size === 0) return null;

  // Rank open, buildable-settlement-reachable vertices by score.
  const allVertices = Object.keys(graph.vertices) as VertexId[];
  const ranked = allVertices
    .filter((vid) => {
      if (state.board.vertices[vid]) return false;
      // must satisfy distance rule so a future settlement is legal there.
      for (const adj of graph.adjacentVertices[vid] ?? []) {
        if (state.board.vertices[adj]) return false;
      }
      return true;
    })
    .map((vid) => ({ vid, score: scoreVertex(state, vid, graph, pid) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const { vid } of ranked) {
    const eid = bfsNextRoadEdge(state, pid, graph, ownedVerts, vid);
    if (eid && canBuildRoad(state.board, graph, player, eid)) return eid;
  }

  // Fallback: any legal edge that extends our network.
  for (const eid of Object.keys(graph.edges) as EdgeId[]) {
    if (canBuildRoad(state.board, graph, player, eid)) return eid;
  }
  return null;
}

/** Compute the vertices that are currently on `pid`'s road/building network. */
function getPlayerNetworkVertices(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): Set<VertexId> {
  const set = new Set<VertexId>();
  for (const [vid, b] of Object.entries(state.board.vertices)) {
    if (b?.playerId === pid) set.add(vid as VertexId);
  }
  for (const [vid, k] of Object.entries(state.board.knights)) {
    if (k?.playerId === pid) set.add(vid as VertexId);
  }
  for (const [eid, r] of Object.entries(state.board.edges)) {
    if (r?.playerId !== pid) continue;
    const [vA, vB] = graph.verticesOfEdge[eid as EdgeId]!;
    set.add(vA);
    set.add(vB);
  }
  return set;
}

/**
 * BFS from the player's network toward `target` along empty edges.
 * Returns the first edge on the shortest path, or null if unreachable.
 */
function bfsNextRoadEdge(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
  startSet: Set<VertexId>,
  target: VertexId,
): EdgeId | null {
  if (startSet.has(target)) return null; // already there

  const isBreak = (vid: VertexId): boolean => {
    const b = state.board.vertices[vid];
    if (b && b.playerId !== pid) return true;
    const k = state.board.knights[vid];
    if (k && k.playerId !== pid) return true;
    return false;
  };

  const visited = new Set<VertexId>(startSet);
  const queue: Array<{ vid: VertexId; firstEdge: EdgeId | null }> = [];
  for (const v of startSet) queue.push({ vid: v, firstEdge: null });

  while (queue.length > 0) {
    const { vid, firstEdge } = queue.shift()!;
    for (const eid of graph.edgesOfVertex[vid] ?? []) {
      if (state.board.edges[eid]?.playerId) continue; // blocked by any road
      const [vA, vB] = graph.verticesOfEdge[eid]!;
      const next = vA === vid ? vB! : vA!;
      if (visited.has(next)) continue;
      // Can't path *through* an opponent piece, but it's OK if `next` is the
      // target itself (we build one road reaching it, not past it).
      const traversalBlocked = isBreak(vid);
      if (traversalBlocked && next !== target) continue;
      const useEdge = firstEdge ?? eid;
      if (next === target) return useEdge;
      visited.add(next);
      queue.push({ vid: next, firstEdge: useEdge });
    }
  }
  return null;
}

function findKnightSpot(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): VertexId | null {
  const allVertices = Object.keys(graph.vertices) as VertexId[];
  // Prefer a vertex adjacent to one of our cities (for defense).
  const ranked = allVertices
    .filter((vid) =>
      canRecruitKnight(state.board, graph, state.players[pid]!, vid),
    )
    .map((vid) => {
      let bonus = 0;
      for (const adj of graph.adjacentVertices[vid] ?? []) {
        const b = state.board.vertices[adj];
        if (b?.playerId === pid && b.type === "city") bonus += 3;
      }
      return { vid, bonus };
    })
    .sort((a, b) => b.bonus - a.bonus);
  return ranked[0]?.vid ?? null;
}

function findInactiveKnight(state: GameState, pid: PlayerId): VertexId | null {
  for (const [vid, knight] of Object.entries(state.board.knights)) {
    if (knight?.playerId === pid && !knight.active) return vid as VertexId;
  }
  return null;
}

function findPromotableKnight(
  state: GameState,
  pid: PlayerId,
): VertexId | null {
  // Prefer strength-2 → strength-3 (Mighty) first.
  const candidates = Object.entries(state.board.knights)
    .filter(([, k]) => k?.playerId === pid && k.strength < 3)
    .map(([vid, k]) => ({ vid: vid as VertexId, strength: k!.strength }));
  candidates.sort((a, b) => b.strength - a.strength);
  return candidates[0]?.vid ?? null;
}

function findCityWallTarget(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): VertexId | null {
  let best: VertexId | null = null;
  let bestPips = -1;
  for (const [vid, b] of Object.entries(state.board.vertices)) {
    if (b?.type !== "city" || b.playerId !== pid || b.hasWall) continue;
    let pips = 0;
    for (const hid of graph.hexesOfVertex[vid as VertexId] ?? []) {
      const hex = state.board.hexes[hid];
      if (hex?.number) pips += PIPS[hex.number] ?? 0;
    }
    if (pips > bestPips) {
      bestPips = pips;
      best = vid as VertexId;
    }
  }
  return best;
}

// ─── Knight offense ──────────────────────────────────────────────────────────

function chooseChaseRobber(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): GameAction | null {
  if (!state.barbarian.robberActive) return null;
  const robberHex = Object.values(state.board.hexes).find((h) => h.hasRobber);
  if (!robberHex) return null;

  for (const [vid, knight] of Object.entries(state.board.knights)) {
    if (knight?.playerId !== pid || !knight.active) continue;
    if (!canChaseRobber(state.board, graph, pid, vid as VertexId)) continue;
    // Pick a steal target among the robber hex's other vertices.
    const hexVerts = graph.verticesOfHex[robberHex.id] ?? [];
    let stealFrom: PlayerId | null = null;
    let bestCards = -1;
    for (const v of hexVerts) {
      const b = state.board.vertices[v];
      if (!b || b.playerId === pid) continue;
      const opp = state.players[b.playerId];
      if (!opp) continue;
      const count = Object.values(opp.resources).reduce((a, c) => a + c, 0);
      if (count > bestCards) {
        bestCards = count;
        stealFrom = b.playerId;
      }
    }
    // Move robber to a hex we'd still like it on.
    const destHex = pickAlternateRobberHex(state, pid, graph, robberHex.id);
    return {
      type: "CHASE_ROBBER",
      pid,
      knight: vid as VertexId,
      hid: destHex,
      stealFrom: bestCards > 0 ? stealFrom : null,
    };
  }
  return null;
}

function pickAlternateRobberHex(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
  excludeHid: HexId,
): HexId {
  const allHexIds = Object.keys(state.board.hexes) as HexId[];
  let best: HexId | null = null;
  let bestScore = -1;
  for (const hid of allHexIds) {
    if (hid === excludeHid) continue;
    const hex = state.board.hexes[hid];
    if (!hex || hex.terrain === "desert") continue;
    const hexVerts = graph.verticesOfHex[hid] ?? [];
    if (hexVerts.some((v) => state.board.vertices[v]?.playerId === pid))
      continue;
    const score = PIPS[hex.number ?? 0] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      best = hid;
    }
  }
  return best ?? allHexIds.find((h) => h !== excludeHid) ?? allHexIds[0]!;
}

function chooseDisplaceKnight(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): GameAction | null {
  for (const [fromVid, k] of Object.entries(state.board.knights)) {
    if (k?.playerId !== pid || !k.active) continue;
    for (const [targetVid, tk] of Object.entries(state.board.knights)) {
      if (!tk || tk.playerId === pid) continue;
      if (
        canDisplaceKnight(
          state.board,
          graph,
          pid,
          fromVid as VertexId,
          targetVid as VertexId,
        )
      ) {
        return {
          type: "DISPLACE_KNIGHT",
          pid,
          from: fromVid as VertexId,
          target: targetVid as VertexId,
        };
      }
    }
  }
  return null;
}

function chooseRepositionKnight(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): GameAction | null {
  if (!state.barbarian.robberActive) return null;
  const robberHex = Object.values(state.board.hexes).find((h) => h.hasRobber);
  if (!robberHex) return null;
  const robberVerts = new Set(graph.verticesOfHex[robberHex.id] ?? []);

  for (const [fromVid, k] of Object.entries(state.board.knights)) {
    if (k?.playerId !== pid || !k.active) continue;
    if (robberVerts.has(fromVid as VertexId)) continue; // already adjacent
    // Find a reachable empty vertex adjacent to robber hex.
    for (const to of robberVerts) {
      if (state.board.vertices[to] || state.board.knights[to]) continue;
      if (
        canMoveKnight(
          state.board,
          graph,
          pid,
          fromVid as VertexId,
          to,
        )
      ) {
        return {
          type: "MOVE_KNIGHT",
          pid,
          from: fromVid as VertexId,
          to,
        };
      }
    }
  }
  return null;
}

// ─── Trading ─────────────────────────────────────────────────────────────────

/**
 * Look at the current goal's shortfall and trade toward it using the best
 * available ratio (harbor / merchant / trade-level-3 / MerchantFleet / 4:1).
 */
function findTradeOpportunity(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): GameAction | null {
  const player = state.players[pid]!;
  const goal = computeBotGoal(state, pid, graph);
  const wants = Object.keys(goal.shortfall) as (keyof Resources)[];
  if (wants.length === 0) return null;

  // Trade level 3: 2 identical commodities → 1 of anything.
  if (player.improvements.trade >= 3) {
    const commodities = ["cloth", "coin", "paper"] as const;
    for (const c of commodities) {
      if ((player.resources[c] ?? 0) >= 2) {
        // Make sure we're not giving up a commodity we need ourselves.
        const keepFor =
          goal.kind === "metropolis" && goal.track
            ? TRACK_COMMODITY[goal.track]
            : null;
        if (c === keepFor) continue;
        const want = wants[0]!;
        return {
          type: "TRADE_BANK",
          pid,
          give: { [c]: 2 },
          get: { [want]: 1 },
        };
      }
    }
  }

  // Otherwise: find best {giveType, ratio} that lets us get one want.
  const candidates: Array<{
    giveType: keyof Resources;
    ratio: number;
  }> = [];
  for (const key of Object.keys(player.resources) as (keyof Resources)[]) {
    const have = player.resources[key] ?? 0;
    const ratio = getBankRatio(player, state.board, key, state.progressEffects);
    if (have < ratio) continue;
    // Don't trade away a resource currently on our shortfall.
    if ((goal.shortfall as Partial<Resources>)[key]) continue;
    // Preserve build essentials loosely — don't trade away the last couple.
    const reserved = reservedFor(goal.kind, key);
    if (have - ratio < reserved) continue;
    candidates.push({ giveType: key, ratio });
  }
  candidates.sort((a, b) => a.ratio - b.ratio);

  if (candidates.length === 0) return null;
  const best = candidates[0]!;
  const want = wants[0]!;
  return {
    type: "TRADE_BANK",
    pid,
    give: { [best.giveType]: best.ratio },
    get: { [want]: 1 },
  };
}

function reservedFor(goal: GoalKind, key: keyof Resources): number {
  switch (goal) {
    case "buildCity":
      if (key === "ore") return 3;
      if (key === "grain") return 2;
      return 0;
    case "buildSettlement":
      if (key === "brick" || key === "lumber" || key === "wool" || key === "grain")
        return 1;
      return 0;
    case "buildRoad":
      if (key === "brick" || key === "lumber") return 1;
      return 0;
    case "metropolis":
    case "improveCity":
      if (key === "cloth" || key === "coin" || key === "paper") return 1;
      return 0;
    case "defendBarbarian":
      if (key === "grain") return 1;
      return 0;
    default:
      return 0;
  }
}

/**
 * Player-to-player trade offer: when the bot has a clean surplus and a real
 * shortfall, propose a reasonable swap.
 */
function findTradeOffer(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): GameAction | null {
  // Already have a pending offer from this player? Don't stack.
  if (state.pendingTradeOffer?.initiatorPid === pid) return null;

  const player = state.players[pid]!;
  const goal = computeBotGoal(state, pid, graph);
  const wants = Object.keys(goal.shortfall) as (keyof Resources)[];
  if (wants.length === 0) return null;
  const want = wants[0]!;

  // Resource-hash guard: don't re-emit if our hand is unchanged.
  const hash = resourceHash(player.resources);
  if (tradeOfferAttemptHash.get(pid) === hash) return null;

  // Find a surplus card we can offer (at least 2 more than reserved).
  const surplus: keyof Resources | null = (() => {
    for (const key of Object.keys(player.resources) as (keyof Resources)[]) {
      if (key === want) continue;
      if ((goal.shortfall as Partial<Resources>)[key]) continue;
      const have = player.resources[key] ?? 0;
      const reserved = reservedFor(goal.kind, key);
      if (have - reserved >= 2) return key;
    }
    return null;
  })();
  if (!surplus) return null;

  // Only offer if bank rate isn't already 2:1 (otherwise just bank-trade).
  const bankRatio = getBankRatio(
    player,
    state.board,
    surplus,
    state.progressEffects,
  );
  if (bankRatio <= 2) return null;

  const targets = state.playerOrder.filter((p) => p !== pid);
  if (targets.length === 0) return null;

  tradeOfferAttemptHash.set(pid, hash);
  return {
    type: "TRADE_OFFER",
    from: pid,
    to: targets,
    offer: { [surplus]: 2 },
    want: { [want]: 1 },
  };
}

// ─── Displaced knight ─────────────────────────────────────────────────────────

function chooseDisplacedMove(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): GameAction {
  const pending = state.pendingDisplace;
  if (!pending || pending.displacedPlayerId !== pid) {
    return { type: "DISPLACED_MOVE", pid, from: "" as VertexId, to: null };
  }

  const from = pending.displacedKnightVertex;
  const allVertices = Object.keys(graph.vertices) as VertexId[];

  // Pick the "safest" reachable vertex: adjacent to our own city if possible.
  let best: VertexId | null = null;
  let bestScore = -1;
  for (const to of allVertices) {
    if (!canRelocateDisplacedKnight(state.board, graph, pid, from, to))
      continue;
    let score = 1;
    for (const adj of graph.adjacentVertices[to] ?? []) {
      const b = state.board.vertices[adj];
      if (b?.playerId === pid && b.type === "city") score += 5;
      if (b?.playerId === pid && b.type === "settlement") score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = to;
    }
  }

  if (best) return { type: "DISPLACED_MOVE", pid, from, to: best };
  return { type: "DISPLACED_MOVE", pid, from, to: null };
}

// ─── Progress draws & discards ───────────────────────────────────────────────

function chooseProgressDraw(state: GameState, pid: PlayerId): GameAction {
  const pending = state.pendingProgressDraw;
  if (!pending || !pending.remaining.includes(pid)) {
    return { type: "END_TURN", pid };
  }
  // If the deck is exhausted the game engine's DRAW_PROGRESS handler returns
  // the state unchanged, which would loop forever. Fall through to ending the
  // turn; the host will advance play.
  if (state.decks[pending.track].length === 0) {
    return { type: "END_TURN", pid };
  }
  return { type: "DRAW_PROGRESS", pid, track: pending.track };
}

function chooseProgressDiscard(state: GameState, pid: PlayerId): GameAction {
  const nonVP = state.players[pid]!.progressCards.filter((c) => !c.isVP);
  if (nonVP.length === 0) {
    return { type: "END_TURN", pid };
  }
  // Keep high-value cards; discard situational low-value ones first.
  const sorted = [...nonVP].sort(
    (a, b) => progressCardDropPriority(a) - progressCardDropPriority(b),
  );
  return { type: "DISCARD_PROGRESS", pid, cards: [sorted[0]!] };
}

/** Lower = more willing to discard. */
function progressCardDropPriority(card: ProgressCard): number {
  // Discard situational cards first.
  const dropFirst: ProgressCardName[] = [
    "Espionage",
    "Sabotage",
    "Intrigue",
    "GuildDues",
    "Wedding",
    "Invention",
    "Alchemy",
    "Diplomacy",
    "Taxation",
    "Treason",
  ];
  const keep: ProgressCardName[] = [
    "Irrigation",
    "Mining",
    "Encouragement",
    "RoadBuilding",
    "Smithing",
    "Merchant",
    "MerchantFleet",
    "Crane",
    "ResourceMonopoly",
    "TradeMonopoly",
    "Engineering",
    "Medicine",
    "CommercialHarbor",
  ];
  if (dropFirst.includes(card.name)) return 0;
  if (keep.includes(card.name)) return 2;
  return 1;
}

function chooseScienceBonus(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): GameAction {
  const BASIC: ResourceType[] = ["brick", "lumber", "ore", "grain", "wool"];
  const goal = computeBotGoal(state, pid, graph);
  const wants = (Object.keys(goal.shortfall) as (keyof Resources)[]).filter(
    (r): r is ResourceType => (BASIC as string[]).includes(r as string),
  );
  const pick: ResourceType = wants[0] ?? "ore";
  return { type: "SELECT_SCIENCE_RESOURCE", pid, resource: pick };
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

// ─── Progress card play ──────────────────────────────────────────────────────
// Returns the highest-value `PLAY_PROGRESS` action the bot should take this
// instant, or null if it should proceed to regular build actions.
// Cards are ranked: free-value first (Irrigation/Mining/Encouragement/...),
// then conditional economic cards (Merchant/Monopolies/...), then situational
// attack cards.

function pickProgressCardAction(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): GameAction | null {
  const player = state.players[pid]!;
  if (player.progressCards.length === 0) return null;

  for (const card of player.progressCards) {
    if (card.isVP) continue; // face-up VP cards can't be "played"
    const action = resolveProgressCard(state, pid, graph, card);
    if (action) return action;
  }
  return null;
}

function resolveProgressCard(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
  card: ProgressCard,
): GameAction | null {
  const player = state.players[pid]!;

  switch (card.name) {
    // ── Free-value cards ────────────────────────────────────────────────────
    case "Irrigation": {
      let grain = 0;
      for (const [hid, hex] of Object.entries(state.board.hexes)) {
        if (hex.terrain !== "fields") continue;
        const verts = graph.verticesOfHex[hid] ?? [];
        if (verts.some((v) => state.board.vertices[v]?.playerId === pid))
          grain += 2;
      }
      if (grain <= 0) return null;
      return { type: "PLAY_PROGRESS", pid, card: "Irrigation" };
    }
    case "Mining": {
      let ore = 0;
      for (const [hid, hex] of Object.entries(state.board.hexes)) {
        if (hex.terrain !== "mountains") continue;
        const verts = graph.verticesOfHex[hid] ?? [];
        if (verts.some((v) => state.board.vertices[v]?.playerId === pid))
          ore += 2;
      }
      if (ore <= 0) return null;
      return { type: "PLAY_PROGRESS", pid, card: "Mining" };
    }
    case "Encouragement": {
      // Play if we have at least one inactive knight.
      const hasInactive = Object.values(state.board.knights).some(
        (k) => k?.playerId === pid && !k.active,
      );
      if (!hasInactive) return null;
      return { type: "PLAY_PROGRESS", pid, card: "Encouragement" };
    }
    case "Engineering": {
      const vid = findCityWallTarget(state, pid, graph);
      if (!vid) return null;
      if (player.supply.cityWalls <= 0) return null;
      return { type: "PLAY_PROGRESS", pid, card: "Engineering", params: { vid } };
    }
    case "Smithing": {
      const promotable = Object.values(state.board.knights).some(
        (k) => k?.playerId === pid && k.strength < 3,
      );
      if (!promotable) return null;
      return { type: "PLAY_PROGRESS", pid, card: "Smithing" };
    }
    case "RoadBuilding": {
      // Only play if at least one free road would be useful.
      const eid = findRoadToBestTarget(state, pid, graph);
      if (!eid) return null;
      if (!canPlaceFreeRoad(state.board, graph, player, eid)) return null;
      return { type: "PLAY_PROGRESS", pid, card: "RoadBuilding" };
    }
    case "Crane": {
      // Only worth playing if we're about to improve AND an improvement is
      // affordable after the discount. Otherwise wasted.
      const track = pickImprovementTrackToBuyWithDiscount(state, pid);
      if (!track) return null;
      return { type: "PLAY_PROGRESS", pid, card: "Crane" };
    }
    // ── Economic cards ──────────────────────────────────────────────────────
    case "Merchant": {
      const hid = pickMerchantHex(state, pid, graph);
      if (!hid) return null;
      return { type: "PLAY_PROGRESS", pid, card: "Merchant", params: { hid } };
    }
    case "MerchantFleet": {
      const cardType = pickMerchantFleetType(state, pid, graph);
      if (!cardType) return null;
      return {
        type: "PLAY_PROGRESS",
        pid,
        card: "MerchantFleet",
        params: { cardType },
      };
    }
    case "ResourceMonopoly": {
      const resource = pickResourceMonopolyTarget(state, pid);
      if (!resource) return null;
      return {
        type: "PLAY_PROGRESS",
        pid,
        card: "ResourceMonopoly",
        params: { resource },
      };
    }
    case "TradeMonopoly": {
      const commodity = pickTradeMonopolyTarget(state, pid);
      if (!commodity) return null;
      return {
        type: "PLAY_PROGRESS",
        pid,
        card: "TradeMonopoly",
        params: { commodity },
      };
    }
    case "CommercialHarbor": {
      // Must have at least one resource to offer; opponents must exist.
      const resources: ResourceType[] = [
        "brick",
        "lumber",
        "ore",
        "grain",
        "wool",
      ];
      const have = resources.filter(
        (r) => (player.resources[r] ?? 0) >= 1,
      );
      if (have.length === 0) return null;
      if (state.playerOrder.length < 2) return null;
      // Offer the resource we have the most of (least useful to keep).
      have.sort(
        (a, b) => (player.resources[b] ?? 0) - (player.resources[a] ?? 0),
      );
      return {
        type: "PLAY_PROGRESS",
        pid,
        card: "CommercialHarbor",
        params: { resource: have[0] },
      };
    }
    case "Medicine": {
      // Play when we have a settlement on board and 1 grain + 2 ore but not
      // the full (3 ore + 2 grain) city cost — i.e. this saves us a build.
      if (player.supply.cities <= 0) return null;
      if ((player.resources.grain ?? 0) < 1) return null;
      if ((player.resources.ore ?? 0) < 2) return null;
      if (hasResources(player, BUILD_COSTS.city)) return null; // just build
      const settlementVid = Object.entries(state.board.vertices).find(
        ([, b]) => b?.type === "settlement" && b.playerId === pid,
      )?.[0] as VertexId | undefined;
      if (!settlementVid) return null;
      return {
        type: "PLAY_PROGRESS",
        pid,
        card: "Medicine",
        params: { vid: settlementVid },
      };
    }
    case "Invention": {
      const swap = pickInventionSwap(state, pid, graph);
      if (!swap) return null;
      return {
        type: "PLAY_PROGRESS",
        pid,
        card: "Invention",
        params: { hid1: swap[0], hid2: swap[1] },
      };
    }
    // ── Targeted attack cards ───────────────────────────────────────────────
    case "Taxation": {
      if (!state.barbarian.robberActive) return null;
      const hid = pickBestRobberHex(state, pid, graph);
      if (!hid) return null;
      return { type: "PLAY_PROGRESS", pid, card: "Taxation", params: { hid } };
    }
    case "Diplomacy": {
      const eid = pickDiplomacyTargetEdge(state, pid, graph);
      if (!eid) return null;
      return { type: "PLAY_PROGRESS", pid, card: "Diplomacy", params: { eid } };
    }
    case "Intrigue": {
      const vid = pickIntrigueTargetKnight(state, pid, graph);
      if (!vid) return null;
      return { type: "PLAY_PROGRESS", pid, card: "Intrigue", params: { vid } };
    }
    case "Treason": {
      const vid = pickIntrigueTargetKnight(state, pid, graph);
      if (!vid) return null;
      return { type: "PLAY_PROGRESS", pid, card: "Treason", params: { vid } };
    }
    case "Espionage": {
      const targetPid = pickEspionageTarget(state, pid);
      if (!targetPid) return null;
      const target = state.players[targetPid]!;
      const nonVPCount = target.progressCards.filter((c) => !c.isVP).length;
      if (nonVPCount === 0) return null;
      return {
        type: "PLAY_PROGRESS",
        pid,
        card: "Espionage",
        params: { targetPid, cardIndex: 0 },
      };
    }
    case "GuildDues": {
      const targetPid = pickGuildDuesTarget(state, pid);
      if (!targetPid) return null;
      const target = state.players[targetPid]!;
      // Take up to 2 of the richest visible resource.
      const keys = Object.keys(target.resources) as (keyof Resources)[];
      keys.sort(
        (a, b) => (target.resources[b] ?? 0) - (target.resources[a] ?? 0),
      );
      const takeCards: Partial<Resources> = {};
      let taken = 0;
      for (const k of keys) {
        if (taken >= 2) break;
        const have = target.resources[k] ?? 0;
        if (have <= 0) continue;
        const take = Math.min(have, 2 - taken);
        takeCards[k] = take;
        taken += take;
      }
      if (taken === 0) return null;
      return {
        type: "PLAY_PROGRESS",
        pid,
        card: "GuildDues",
        params: { targetPid, takeCards },
      };
    }
    case "Sabotage": {
      // Play if at least one opponent has VP >= us AND cards to discard.
      const myVP = computeVP(state, pid);
      const atLeastOne = state.playerOrder.some((opp) => {
        if (opp === pid) return false;
        if (computeVP(state, opp) < myVP) return false;
        const r = state.players[opp]?.resources;
        if (!r) return false;
        return Object.values(r).reduce((a, b) => a + b, 0) >= 2;
      });
      if (!atLeastOne) return null;
      return { type: "PLAY_PROGRESS", pid, card: "Sabotage" };
    }
    case "Wedding": {
      // Play if we have at least one opponent with > VP than us.
      const myVP = computeVP(state, pid);
      const anyAhead = state.playerOrder.some(
        (opp) => opp !== pid && computeVP(state, opp) > myVP,
      );
      if (!anyAhead) return null;
      return { type: "PLAY_PROGRESS", pid, card: "Wedding" };
    }
    // Alchemy is handled in ROLL_DICE branch.
    default:
      return null;
  }
}

function pickImprovementTrackToBuyWithDiscount(
  state: GameState,
  pid: PlayerId,
): ImprovementTrack | null {
  // Same logic as pickImprovementTrackToBuy but with Crane's -1 commodity.
  const player = state.players[pid]!;
  if (!playerHasCity(state.board, pid)) return null;
  const tracks: ImprovementTrack[] = ["science", "trade", "politics"];
  const affordable = tracks.filter((t) =>
    canImproveCity(state.board, player, t, true),
  );
  return affordable[0] ?? null;
}

function pickMerchantHex(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): HexId | null {
  let best: HexId | null = null;
  let bestPips = -1;
  for (const [hid, hex] of Object.entries(state.board.hexes)) {
    if (hex.terrain === "desert" || hex.number === null) continue;
    const verts = graph.verticesOfHex[hid] ?? [];
    if (!verts.some((v) => state.board.vertices[v]?.playerId === pid)) continue;
    const pips = PIPS[hex.number] ?? 0;
    if (pips > bestPips) {
      bestPips = pips;
      best = hid;
    }
  }
  return best;
}

function pickMerchantFleetType(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): keyof Resources | null {
  const player = state.players[pid]!;
  // Pick a card type the bot has in surplus (>=3) so the 2:1 is actually useful.
  const goal = computeBotGoal(state, pid, graph);
  const wants = Object.keys(goal.shortfall) as (keyof Resources)[];
  if (wants.length === 0) return null;
  let best: keyof Resources | null = null;
  let bestHave = 0;
  for (const k of Object.keys(player.resources) as (keyof Resources)[]) {
    if ((goal.shortfall as Partial<Resources>)[k]) continue;
    const have = player.resources[k] ?? 0;
    if (have >= 3 && have > bestHave) {
      bestHave = have;
      best = k;
    }
  }
  return best;
}

function pickResourceMonopolyTarget(
  state: GameState,
  pid: PlayerId,
): ResourceType | null {
  const resources: ResourceType[] = ["brick", "lumber", "ore", "grain", "wool"];
  // Pick the resource opponents hold most of AND we're short on.
  let best: ResourceType | null = null;
  let bestTotal = 0;
  for (const r of resources) {
    let total = 0;
    for (const [oppId, opp] of Object.entries(state.players)) {
      if (oppId === pid) continue;
      total += opp.resources[r] ?? 0;
    }
    if (total > bestTotal) {
      bestTotal = total;
      best = r;
    }
  }
  return bestTotal >= 1 ? best : null;
}

function pickTradeMonopolyTarget(
  state: GameState,
  pid: PlayerId,
): CommodityType | null {
  const commodities: CommodityType[] = ["cloth", "coin", "paper"];
  let best: CommodityType | null = null;
  let bestTotal = 0;
  for (const c of commodities) {
    let total = 0;
    for (const [oppId, opp] of Object.entries(state.players)) {
      if (oppId === pid) continue;
      if ((opp.resources[c] ?? 0) > 0) total += 1;
    }
    if (total > bestTotal) {
      bestTotal = total;
      best = c;
    }
  }
  return bestTotal > 0 ? best : null;
}

function pickInventionSwap(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): [HexId, HexId] | null {
  // Swap a hot hex (high pips) away from the leader/opponents onto a desert or
  // low-pip hex. Forbidden numbers per rules: 2, 6, 8, 12.
  const forbidden = new Set([2, 6, 8, 12]);
  const hexes = Object.entries(state.board.hexes)
    .filter(([, h]) => h.number !== null && !forbidden.has(h.number))
    .map(([hid, h]) => ({ hid: hid as HexId, hex: h }));

  let bestSwap: [HexId, HexId] | null = null;
  let bestGain = 0;
  for (const a of hexes) {
    const aVerts = graph.verticesOfHex[a.hid] ?? [];
    const aOppPresence = aVerts.some(
      (v) =>
        state.board.vertices[v] &&
        state.board.vertices[v]!.playerId !== pid,
    );
    const aPips = PIPS[a.hex.number ?? 0] ?? 0;
    for (const b of hexes) {
      if (a.hid === b.hid) continue;
      const bVerts = graph.verticesOfHex[b.hid] ?? [];
      const bSelfPresence = bVerts.some(
        (v) => state.board.vertices[v]?.playerId === pid,
      );
      const bPips = PIPS[b.hex.number ?? 0] ?? 0;
      if (!aOppPresence || !bSelfPresence) continue;
      const gain = aPips - bPips;
      if (gain > bestGain) {
        bestGain = gain;
        bestSwap = [a.hid, b.hid];
      }
    }
  }
  return bestSwap;
}

function pickBestRobberHex(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): HexId | null {
  const leadPid = getLeadPlayer(state, pid);
  let best: HexId | null = null;
  let bestScore = -1;
  for (const [hid, hex] of Object.entries(state.board.hexes)) {
    if (hex.hasRobber || hex.terrain === "desert") continue;
    const verts = graph.verticesOfHex[hid] ?? [];
    if (verts.some((v) => state.board.vertices[v]?.playerId === pid)) continue;
    const leadIsHere = verts.some(
      (v) => state.board.vertices[v]?.playerId === leadPid,
    );
    const score = (leadIsHere ? 100 : 0) + (PIPS[hex.number ?? 0] ?? 0);
    if (score > bestScore) {
      bestScore = score;
      best = hid;
    }
  }
  return best;
}

function pickDiplomacyTargetEdge(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): EdgeId | null {
  // Prefer to remove an open road of the longest-road owner (if not us).
  const target =
    state.longestRoadOwner && state.longestRoadOwner !== pid
      ? state.longestRoadOwner
      : null;
  for (const [eid, r] of Object.entries(state.board.edges)) {
    if (!r) continue;
    if (target ? r.playerId !== target : r.playerId === pid) continue;
    if (!isOpenRoad(state.board, graph, eid as EdgeId)) continue;
    return eid as EdgeId;
  }
  return null;
}

function pickIntrigueTargetKnight(
  state: GameState,
  pid: PlayerId,
  graph: CatanGraph,
): VertexId | null {
  for (const [vid, k] of Object.entries(state.board.knights)) {
    if (!k || k.playerId === pid) continue;
    if (isOnPlayerNetwork(state.board, graph, pid, vid as VertexId))
      return vid as VertexId;
  }
  return null;
}

function pickEspionageTarget(
  state: GameState,
  pid: PlayerId,
): PlayerId | null {
  // Target the richest (non-VP-card-count) opponent.
  let best: PlayerId | null = null;
  let bestCount = 0;
  for (const [oppId, opp] of Object.entries(state.players)) {
    if (oppId === pid) continue;
    const nonVP = opp.progressCards.filter((c) => !c.isVP).length;
    if (nonVP > bestCount) {
      bestCount = nonVP;
      best = oppId;
    }
  }
  return best;
}

function pickGuildDuesTarget(
  state: GameState,
  pid: PlayerId,
): PlayerId | null {
  const myVP = computeVP(state, pid);
  let best: PlayerId | null = null;
  let bestCount = 0;
  for (const [oppId, opp] of Object.entries(state.players)) {
    if (oppId === pid) continue;
    if (computeVP(state, oppId) < myVP) continue;
    const cards = Object.values(opp.resources).reduce((a, c) => a + c, 0);
    if (cards > bestCount) {
      bestCount = cards;
      best = oppId;
    }
  }
  return bestCount >= 1 ? best : null;
}

// ─── Alchemy (pre-roll) ──────────────────────────────────────────────────────

function maybePlayAlchemy(state: GameState, pid: PlayerId, graph: CatanGraph): GameAction | null {
  const player = state.players[pid];
  if (!player) return null;
  const hasAlchemy = player.progressCards.some((c) => c.name === "Alchemy");
  if (!hasAlchemy) return null;

  // Pick a total that produces for us (ideally a number we have adjacent to cities).
  // Scan 2..12 and pick the one with highest "own-production pip weight."
  let bestTotal = 8;
  let bestGain = -1;
  const numToDice: Record<number, [number, number]> = {
    2: [1, 1],
    3: [1, 2],
    4: [2, 2],
    5: [2, 3],
    6: [3, 3],
    7: [3, 4],
    8: [4, 4],
    9: [4, 5],
    10: [5, 5],
    11: [5, 6],
    12: [6, 6],
  };
  for (let n = 2; n <= 12; n++) {
    if (n === 7) continue;
    let gain = 0;
    for (const [hid, hex] of Object.entries(state.board.hexes)) {
      if (hex.number !== n) continue;
      const verts = graph.verticesOfHex[hid] ?? [];
      for (const v of verts) {
        const b = state.board.vertices[v];
        if (!b || b.playerId !== pid) continue;
        gain += b.type === "city" ? 2 : 1;
      }
    }
    if (gain > bestGain) {
      bestGain = gain;
      bestTotal = n;
    }
  }

  if (bestGain <= 0) return null; // no point

  const [d1, d2] = numToDice[bestTotal]!;
  return {
    type: "PLAY_PROGRESS",
    pid,
    card: "Alchemy",
    params: { die1: d1, die2: d2 },
  };
}

// Silence unused-import warnings (some helpers may become unused under tree-shake).
void rollProductionDie;
void canReachVertex;
void hasKnightUpTo;
