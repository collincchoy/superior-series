import type {
  BoardState,
  Player,
  PlayerId,
  VertexId,
  EdgeId,
  HexId,
  ImprovementTrack,
  Resources,
  KnightStrength,
  TerrainType,
} from "./types.js";
import type { CatanGraph } from "./board.js";
import { BUILD_COSTS, TRACK_COMMODITY } from "./constants.js";

// ─── Resource Helpers ─────────────────────────────────────────────────────────

export function hasResources(
  player: Player,
  cost: Partial<Resources>,
): boolean {
  for (const [key, amount] of Object.entries(cost) as [
    keyof Resources,
    number,
  ][]) {
    if ((player.resources[key] ?? 0) < amount) return false;
  }
  return true;
}

// ─── Graph Helpers ────────────────────────────────────────────────────────────

/**
 * Returns true if `playerId` has a road, settlement, city, or knight
 * connected to `vertex` (i.e., vertex is part of their continuous network).
 */
function isConnectedToNetwork(
  board: BoardState,
  graph: CatanGraph,
  playerId: PlayerId,
  vertex: VertexId,
): boolean {
  // Check: the vertex itself has the player's building
  const building = board.vertices[vertex];
  if (building?.playerId === playerId) return true;

  // Check: any adjacent edge has the player's road
  for (const eid of graph.edgesOfVertex[vertex] ?? []) {
    if (board.edges[eid]?.playerId === playerId) return true;
  }

  // Check: the vertex has the player's knight
  if (board.knights[vertex]?.playerId === playerId) return true;

  return false;
}

/**
 * Check if playerId can traverse from `start` to `target` along their own
 * road network (BFS). Used for knight movement and displacement.
 */
export function canReachVertex(
  board: BoardState,
  graph: CatanGraph,
  playerId: PlayerId,
  start: VertexId,
  target: VertexId,
): boolean {
  if (start === target) return true;

  const visited = new Set<VertexId>();
  const queue: VertexId[] = [start];
  visited.add(start);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const eid of graph.edgesOfVertex[current] ?? []) {
      if (board.edges[eid]?.playerId !== playerId) continue;
      const [vA, vB] = graph.verticesOfEdge[eid]!;
      const next = vA === current ? vB! : vA!;
      if (next === target) return true;
      if (visited.has(next)) continue;
      // Can't pass through opponent buildings or knights
      const oppBuilding = board.vertices[next];
      if (oppBuilding && oppBuilding.playerId !== playerId) continue;
      const oppKnight = board.knights[next];
      if (oppKnight && oppKnight.playerId !== playerId) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return false;
}

// ─── Player has a city on the board ──────────────────────────────────────────

export function playerHasCity(board: BoardState, playerId: PlayerId): boolean {
  return Object.values(board.vertices).some(
    (b) => b?.type === "city" && b.playerId === playerId,
  );
}

// ─── Setup Phase ──────────────────────────────────────────────────────────────

/**
 * Can place a settlement at `vid` during setup or action phase.
 * @param isSetup true during setup phase (no road connectivity required)
 */
export function canPlaceSettlement(
  board: BoardState,
  graph: CatanGraph,
  playerId: PlayerId,
  vid: VertexId,
  isSetup: boolean,
): boolean {
  // Vertex must be empty (no building, no knight)
  if (board.vertices[vid] !== null) return false;
  if (board.knights[vid] !== null) return false;

  // Distance rule: all adjacent vertices must be empty
  for (const adj of graph.adjacentVertices[vid] ?? []) {
    if (board.vertices[adj] !== null) return false;
  }

  // During action phase: must connect to own road network
  if (!isSetup && !isConnectedToNetwork(board, graph, playerId, vid)) {
    return false;
  }

  return true;
}

/**
 * Can place a city at `vid` during setup (C&K: round 2 players place a city).
 */
export function canPlaceCity(
  board: BoardState,
  graph: CatanGraph,
  playerId: PlayerId,
  vid: VertexId,
): boolean {
  // Same as setup settlement placement: empty + distance rule
  if (board.vertices[vid] !== null) return false;
  if (board.knights[vid] !== null) return false;
  for (const adj of graph.adjacentVertices[vid] ?? []) {
    if (board.vertices[adj] !== null) return false;
  }
  return true;
}

/**
 * Can place road at `eid` during setup, adjacent to `adjacentVertex`.
 */
export function canPlaceRoad(
  board: BoardState,
  graph: CatanGraph,
  playerId: PlayerId,
  eid: EdgeId,
  adjacentVertex: VertexId,
): boolean {
  if (board.edges[eid] !== null) return false;

  // Must be adjacent to the recently placed building
  const [vA, vB] = graph.verticesOfEdge[eid] ?? [];
  if (vA !== adjacentVertex && vB !== adjacentVertex) return false;

  return true;
}

// ─── Action Phase ─────────────────────────────────────────────────────────────

export function canBuildRoad(
  board: BoardState,
  graph: CatanGraph,
  player: Player,
  eid: EdgeId,
): boolean {
  if (!hasResources(player, BUILD_COSTS.road)) return false;
  if (player.supply.roads <= 0) return false;
  if (board.edges[eid] !== null) return false;

  // Must connect to player's network
  const [vA, vB] = graph.verticesOfEdge[eid] ?? [];
  if (!vA || !vB) return false;

  // Check each endpoint: if it's a break vertex (opponent building/knight), skip it
  const isBreak = (vid: VertexId): boolean => {
    const b = board.vertices[vid];
    if (b && b.playerId !== player.id) return true;
    const k = board.knights[vid];
    if (k && k.playerId !== player.id) return true;
    return false;
  };

  const canConnectFrom = (vid: VertexId): boolean => {
    if (isBreak(vid)) return false;
    return isConnectedToNetwork(board, graph, player.id, vid);
  };

  return canConnectFrom(vA) || canConnectFrom(vB);
}

export function canBuildSettlement(
  board: BoardState,
  graph: CatanGraph,
  player: Player,
  vid: VertexId,
): boolean {
  if (!hasResources(player, BUILD_COSTS.settlement)) return false;
  if (player.supply.settlements <= 0) return false;
  return canPlaceSettlement(board, graph, player.id, vid, false);
}

export function canBuildCity(
  board: BoardState,
  player: Player,
  vid: VertexId,
): boolean {
  if (!hasResources(player, BUILD_COSTS.city)) return false;
  if (player.supply.cities <= 0) return false;
  const building = board.vertices[vid];
  return building?.type === "settlement" && building.playerId === player.id;
}

export function canBuildCityWall(
  board: BoardState,
  player: Player,
  vid: VertexId,
): boolean {
  if (!hasResources(player, BUILD_COSTS.cityWall)) return false;
  if (player.supply.cityWalls <= 0) return false;
  const building = board.vertices[vid];
  return (
    building?.type === "city" &&
    building.playerId === player.id &&
    !building.hasWall
  );
}

// ─── Knights ──────────────────────────────────────────────────────────────────

export function canRecruitKnight(
  board: BoardState,
  graph: CatanGraph,
  player: Player,
  vid: VertexId,
): boolean {
  if (!hasResources(player, BUILD_COSTS.knightRecruit)) return false;
  if (player.supply.knights[1] <= 0) return false;
  if (board.vertices[vid] !== null) return false; // occupied by building
  if (board.knights[vid] !== null) return false; // occupied by knight

  // Must connect to own road network
  if (!isConnectedToNetwork(board, graph, player.id, vid)) return false;

  return true;
}

export function canPromoteKnight(
  board: BoardState,
  player: Player,
  vid: VertexId,
): boolean {
  if (!hasResources(player, BUILD_COSTS.knightPromote)) return false;
  const knight = board.knights[vid];
  if (!knight || knight.playerId !== player.id) return false;
  if (knight.strength >= 3) return false;
  // Can only promote to mighty (strength 3) if politics level >= 3
  if (knight.strength === 2 && player.improvements.politics < 3) return false;
  const nextStrength = (knight.strength + 1) as KnightStrength;
  if (player.supply.knights[nextStrength] <= 0) return false;
  return true;
}

export function canActivateKnight(
  board: BoardState,
  player: Player,
  vid: VertexId,
): boolean {
  if (!hasResources(player, BUILD_COSTS.knightActivate)) return false;
  const knight = board.knights[vid];
  return !!(knight && knight.playerId === player.id && !knight.active);
}

export function canMoveKnight(
  board: BoardState,
  graph: CatanGraph,
  playerId: PlayerId,
  from: VertexId,
  to: VertexId,
): boolean {
  const knight = board.knights[from];
  if (!knight || knight.playerId !== playerId || !knight.active) return false;
  if (from === to) return false;
  if (board.vertices[to] !== null) return false; // occupied by building
  if (board.knights[to] !== null) return false; // occupied by another knight
  return canReachVertex(board, graph, playerId, from, to);
}

export function canRelocateDisplacedKnight(
  board: BoardState,
  graph: CatanGraph,
  playerId: PlayerId,
  from: VertexId,
  to: VertexId,
): boolean {
  if (from === to) return false;
  if (board.vertices[to] !== null) return false;
  if (board.knights[to] !== null) return false;
  return canReachVertex(board, graph, playerId, from, to);
}

export function canDisplaceKnight(
  board: BoardState,
  graph: CatanGraph,
  playerId: PlayerId,
  from: VertexId,
  target: VertexId,
): boolean {
  const myKnight = board.knights[from];
  if (!myKnight || myKnight.playerId !== playerId || !myKnight.active)
    return false;

  const theirKnight = board.knights[target];
  if (!theirKnight || theirKnight.playerId === playerId) return false;

  // Must be strictly stronger
  if (myKnight.strength <= theirKnight.strength) return false;

  return canReachVertex(board, graph, playerId, from, target);
}

export function canChaseRobber(
  board: BoardState,
  graph: CatanGraph,
  playerId: PlayerId,
  knightVid: VertexId,
): boolean {
  // Robber must be active and placed on a hex
  const robberHex = Object.values(board.hexes).find((h) => h.hasRobber);
  if (!robberHex) return false;

  // Knight must exist, be owned, and be active
  const knight = board.knights[knightVid];
  if (!knight || knight.playerId !== playerId || !knight.active) return false;

  // Knight vertex must be adjacent to the robber hex
  const hexVertices = graph.verticesOfHex[robberHex.id] ?? [];
  return hexVertices.includes(knightVid);
}

// ─── City Improvements ────────────────────────────────────────────────────────

export function canImproveCity(
  board: BoardState,
  player: Player,
  track: ImprovementTrack,
  hasCraneDiscount = false,
): boolean {
  if (!playerHasCity(board, player.id)) return false;

  const currentLevel = player.improvements[track];
  if (currentLevel >= 5) return false;

  const targetLevel = currentLevel + 1;
  const commodity = TRACK_COMMODITY[track];
  const cost = Math.max(0, targetLevel - (hasCraneDiscount ? 1 : 0));

  return (player.resources[commodity] ?? 0) >= cost;
}

// ─── Discard Validation ───────────────────────────────────────────────────────

/**
 * Returns how many cards a player must discard when a 7 is rolled.
 * Standard: if hand > 7 (or modified by city walls), discard half rounded down.
 * City walls each increase limit by 2.
 */
/** How many non-VP progress cards the player must discard to be at most 4. */
export function progressDiscardCount(player: Player): number {
  const nonVp = player.progressCards.filter((c) => !c.isVP).length;
  return Math.max(0, nonVp - 4);
}

export function discardCount(player: Player, board: BoardState): number {
  const wallCount = countPlayerCityWalls(board, player.id);
  const limit = 7 + wallCount * 2;
  const total = Object.values(player.resources).reduce((a, b) => a + b, 0);
  if (total <= limit) return 0;
  return Math.floor(total / 2);
}

function countPlayerCityWalls(board: BoardState, playerId: PlayerId): number {
  return Object.values(board.vertices).filter(
    (b) => b?.type === "city" && b.playerId === playerId && b.hasWall,
  ).length;
}

// ─── Trade Validation ─────────────────────────────────────────────────────────

const COMMODITY_KEYS = new Set<keyof Resources>(["cloth", "coin", "paper"]);

export function canTradeBank(
  player: Player,
  board: BoardState,
  give: Partial<Resources>,
  get: Partial<Resources>,
  progressEffects?: {
    merchantFleet?: { playerId: PlayerId; cardType: keyof Resources } | null;
  },
): boolean {
  // Validate give amounts
  for (const [key, amount] of Object.entries(give) as [
    keyof Resources,
    number,
  ][]) {
    if ((player.resources[key] ?? 0) < amount) return false;
  }

  // Each "give" group must be a single resource/commodity type and correct ratio
  const giveEntries = Object.entries(give).filter(([, v]) => v > 0) as [
    keyof Resources,
    number,
  ][];
  if (giveEntries.length !== 1) return false; // simple bank trade: 1 type given
  const [giveType, giveAmount] = giveEntries[0]!;

  // Trade level 3: any 2 identical commodities → 1 resource or commodity
  if (
    player.improvements.trade >= 3 &&
    COMMODITY_KEYS.has(giveType) &&
    giveAmount === 2
  ) {
    const getEntries = Object.entries(get).filter(([, v]) => v > 0);
    return getEntries.length === 1;
  }

  // Determine best ratio for this resource from harbors (+ optional MerchantFleet)
  const ratio = getBankRatio(player, board, giveType, progressEffects);
  if (giveAmount < ratio) return false;

  // Receive exactly 1 type
  const getEntries = Object.entries(get).filter(([, v]) => v > 0);
  if (getEntries.length !== 1) return false;

  return true;
}

export function getBankRatio(
  player: Player,
  board: BoardState,
  cardType: keyof Resources,
  progressEffects?: {
    merchantFleet?: { playerId: PlayerId; cardType: keyof Resources } | null;
  },
): number {
  const playerVertices = new Set(
    Object.entries(board.vertices)
      .filter(([, b]) => b?.playerId === player.id)
      .map(([vid]) => vid),
  );

  let best = 4;
  for (const harbor of board.harbors) {
    const [v1, v2] = harbor.vertices;
    if (playerVertices.has(v1) || playerVertices.has(v2)) {
      if (harbor.type === "generic") best = Math.min(best, 3);
      else if (harbor.type === cardType) best = Math.min(best, 2);
    }
  }

  if (board.merchantOwner === player.id && board.merchantHex) {
    const merchantHex = board.hexes[board.merchantHex];
    const merchantType = merchantHex
      ? terrainToTradeResource(merchantHex.terrain)
      : null;
    if (merchantType === cardType) best = Math.min(best, 2);
  }

  // MerchantFleet progress effect: 2:1 for the named card type this turn
  if (
    progressEffects?.merchantFleet &&
    progressEffects.merchantFleet.playerId === player.id &&
    progressEffects.merchantFleet.cardType === cardType
  ) {
    best = Math.min(best, 2);
  }

  return best;
}

function terrainToTradeResource(terrain: TerrainType): keyof Resources | null {
  switch (terrain) {
    case "hills":
      return "brick";
    case "forest":
      return "lumber";
    case "mountains":
      return "ore";
    case "fields":
      return "grain";
    case "pasture":
      return "wool";
    default:
      return null;
  }
}

// ─── Progress Card Helpers ───────────────────────────────────────────────────

/** Like canBuildRoad but skips resource checks (for RoadBuilding progress card). */
export function canPlaceFreeRoad(
  board: BoardState,
  graph: CatanGraph,
  player: Player,
  eid: EdgeId,
): boolean {
  if (player.supply.roads <= 0) return false;
  if (board.edges[eid] !== null) return false;
  const [vA, vB] = graph.verticesOfEdge[eid] ?? [];
  if (!vA || !vB) return false;
  const isBreak = (vid: VertexId): boolean => {
    const b = board.vertices[vid];
    if (b && b.playerId !== player.id) return true;
    const k = board.knights[vid];
    if (k && k.playerId !== player.id) return true;
    return false;
  };
  const canConnectFrom = (vid: VertexId): boolean => {
    if (isBreak(vid)) return false;
    return isConnectedToNetwork(board, graph, player.id, vid);
  };
  return canConnectFrom(vA) || canConnectFrom(vB);
}

/** Like canPromoteKnight but skips resource checks (for Smithing progress card). */
export function canPromoteFreeKnight(
  board: BoardState,
  player: Player,
  vid: VertexId,
): boolean {
  const knight = board.knights[vid];
  if (!knight || knight.playerId !== player.id) return false;
  if (knight.strength >= 3) return false;
  if (knight.strength === 2 && player.improvements.politics < 3) return false;
  const nextStrength = (knight.strength + 1) as KnightStrength;
  if (player.supply.knights[nextStrength] <= 0) return false;
  return true;
}

/** Returns true if the road at eid is open: at least one endpoint has no other piece belonging to the road's owner. */
export function isOpenRoad(
  board: BoardState,
  graph: CatanGraph,
  eid: EdgeId,
): boolean {
  const road = board.edges[eid];
  if (!road) return false;
  const owner = road.playerId;
  const [vA, vB] = graph.verticesOfEdge[eid] ?? [];
  if (!vA || !vB) return false;
  const vertexIsConnected = (vid: VertexId): boolean => {
    if (board.vertices[vid]?.playerId === owner) return true;
    if (board.knights[vid]?.playerId === owner) return true;
    for (const adjEid of graph.edgesOfVertex[vid] ?? []) {
      if (adjEid === eid) continue;
      if (board.edges[adjEid]?.playerId === owner) return true;
    }
    return false;
  };
  return !vertexIsConnected(vA) || !vertexIsConnected(vB);
}

/** Returns true if vid is adjacent to or part of playerId's road network. */
export function isOnPlayerNetwork(
  board: BoardState,
  graph: CatanGraph,
  playerId: PlayerId,
  vid: VertexId,
): boolean {
  return isConnectedToNetwork(board, graph, playerId, vid);
}

// ─── Knight Supply Helpers ─────────────────────────────────────────────────────

export function bestKnightUpTo(player: Player, max: KnightStrength): KnightStrength | undefined {
  return ([3, 2, 1] as const).find(
    (str) => str <= max && (player.supply.knights[str] ?? 0) > 0,
  );
}

export function hasKnightUpTo(player: Player, max: KnightStrength): boolean {
  return ([1, 2, 3] as const).some(
    (str) => str <= max && (player.supply.knights[str] ?? 0) > 0,
  );
}
