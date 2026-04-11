import type {
  HexCoord,
  HexId,
  VertexId,
  EdgeId,
  BoardState,
  PlayerId,
} from "./types.js";

// ─── Hex Coordinates ──────────────────────────────────────────────────────────

/**
 * All 19 Catan island hexes in axial (q, r) coordinates.
 * Satisfies: max(|q|, |r|, |q+r|) <= 2
 *
 * Axial coordinate system:
 *   q — increases to the right (east)
 *   r — increases downward (each row is a constant r value)
 *   s = -(q+r) — implicit third axis
 *
 * Board layout (q,r shown per hex):
 *
 *            ┌─────┐ ┌─────┐ ┌─────┐
 *    r=-2    │ 0,-2│ │ 1,-2│ │ 2,-2│
 *            └─────┘ └─────┘ └─────┘
 *          ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
 *    r=-1  │-1,-1│ │ 0,-1│ │ 1,-1│ │ 2,-1│
 *          └─────┘ └─────┘ └─────┘ └─────┘
 *       ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
 *    r=0│-2, 0│ │-1, 0│ │ 0, 0│ │ 1, 0│ │ 2, 0│
 *       └─────┘ └─────┘ └─────┘ └─────┘ └─────┘
 *          ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
 *    r=1   │-2, 1│ │-1, 1│ │ 0, 1│ │ 1, 1│
 *          └─────┘ └─────┘ └─────┘ └─────┘
 *            ┌─────┐ ┌─────┐ ┌─────┐
 *    r=2     │-2, 2│ │-1, 2│ │ 0, 2│
 *            └─────┘ └─────┘ └─────┘
 *
 * Pixel mapping (pointy-top, see hexToPixel):
 *   x = size * (√3·q + √3/2·r)   — q controls x; r adds half-hex stagger
 *   y = size * (3/2)·r            — r directly controls y
 *
 * Neighbor directions (HEX_DIRECTIONS index → offset):
 *   0 E  (q+1, r  )    3 W  (q-1, r  )
 *   1 NE (q+1, r-1)    4 SW (q-1, r+1)
 *   2 NW (q,   r-1)    5 SE (q,   r+1)
 */
export const CATAN_HEX_COORDS: HexCoord[] = [
  // r = -2 (top row, 3 hexes)
  { q: 0, r: -2 },
  { q: 1, r: -2 },
  { q: 2, r: -2 },
  // r = -1 (4 hexes)
  { q: -1, r: -1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: 2, r: -1 },
  // r = 0 (middle row, 5 hexes)
  { q: -2, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 2, r: 0 },
  // r = 1 (4 hexes)
  { q: -2, r: 1 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
  { q: 1, r: 1 },
  // r = 2 (bottom row, 3 hexes)
  { q: -2, r: 2 },
  { q: -1, r: 2 },
  { q: 0, r: 2 },
];

export function hexId(c: HexCoord): HexId {
  return `${c.q},${c.r}`;
}

// ─── Pixel Coordinates (pointy-top hexes) ─────────────────────────────────────

/**
 * Convert axial hex coordinate to pixel center (pointy-top orientation).
 * With this formula, same-r rows are horizontal — the standard Catan board layout.
 * @param size circumradius (distance from center to corner)
 */
export function hexToPixel(
  coord: HexCoord,
  size: number,
): { x: number; y: number } {
  return {
    x: size * (Math.sqrt(3) * coord.q + (Math.sqrt(3) / 2) * coord.r),
    y: size * (3 / 2) * coord.r,
  };
}

/**
 * Pixel position of a local vertex (0..5) on a hex.
 * Pointy-top: v0 = bottom (90°), going clockwise by 60°.
 * Consistent with hexesSharingVertex which uses dirs (v+4)%6 and (v+5)%6.
 */
export function vertexPixel(
  coord: HexCoord,
  localVertex: number,
  size: number,
): { x: number; y: number } {
  const center = hexToPixel(coord, size);
  const angle = (Math.PI / 180) * (90 + 60 * localVertex); // v0=90° (bottom), v3=270° (top)
  return {
    x: center.x + size * Math.cos(angle),
    y: center.y + size * Math.sin(angle),
  };
}

// ─── Graph Precomputation ─────────────────────────────────────────────────────

/**
 * Hex neighbor directions for this axial, pointy-top layout.
 * Direction index (0..5): E, NE, NW, W, SW, SE.
 */
const HEX_DIRECTIONS: HexCoord[] = [
  { q: 1, r: 0 }, // 0: E
  { q: 1, r: -1 }, // 1: NE
  { q: 0, r: -1 }, // 2: NW
  { q: -1, r: 0 }, // 3: W
  { q: -1, r: 1 }, // 4: SW
  { q: 0, r: 1 }, // 5: SE
];

/**
 * Returns the (up to 3) hex coords that share local vertex v of hex H.
 * For this pointy-top mapping, we compute the two neighboring hex directions
 * around vertex v and include the source hex itself.
 */
function hexesSharingVertex(hex: HexCoord, v: number): HexCoord[] {
  // The vertex v is shared with neighbors at directions:
  //   dir = (v + 4) % 6  and  dir = (v + 5) % 6
  // These are the two hexes "around" that corner.
  const d1 = (10 - v) % 6;
  const d2 = (11 - v) % 6;
  const n1 = {
    q: hex.q + HEX_DIRECTIONS[d1]!.q,
    r: hex.r + HEX_DIRECTIONS[d1]!.r,
  };
  const n2 = {
    q: hex.q + HEX_DIRECTIONS[d2]!.q,
    r: hex.r + HEX_DIRECTIONS[d2]!.r,
  };
  return [hex, n1, n2];
}

/**
 * The local vertex index on `owner` that corresponds to vertex v of `original`.
 * We find the shared vertex by looking at which corner of `owner` points to `original`.
 */
function localVertexOnOwner(
  original: HexCoord,
  origV: number,
  owner: HexCoord,
): number {
  // The three hexes around vertex (original, origV) are hexesSharingVertex(original, origV).
  // Each of those hexes has a local vertex that points to the same corner.
  // For hex `owner`, we need to find which of its 6 vertices corresponds to origV of original.
  for (let ov = 0; ov < 6; ov++) {
    const sharing = hexesSharingVertex(owner, ov);
    if (sharing.some((h) => h.q === original.q && h.r === original.r)) {
      // Verify all three are the same as the original set
      const origSharing = hexesSharingVertex(original, origV);
      const ownerSharing = hexesSharingVertex(owner, ov);
      const origSet = new Set(origSharing.map((h) => hexId(h)));
      const ownerSet = new Set(ownerSharing.map((h) => hexId(h)));
      if (
        origSet.size === ownerSet.size &&
        [...origSet].every((x) => ownerSet.has(x))
      ) {
        return ov;
      }
    }
  }
  return -1; // shouldn't happen
}

/**
 * Canonical vertex ID: owned by the lexicographically smallest hex among
 * the (up to 3) hexes sharing this vertex.
 */
function canonicalVertexId(hex: HexCoord, localV: number): VertexId {
  const sharing = hexesSharingVertex(hex, localV);
  // Filter to only island hexes
  const islandIds = new Set(CATAN_HEX_COORDS.map(hexId));
  const islandSharing = sharing.filter((h) => islandIds.has(hexId(h)));
  if (islandSharing.length === 0) return `${hexId(hex)}:${localV}`; // shouldn't happen

  // Pick the smallest by (q, r) lexicographic order
  islandSharing.sort((a, b) => (a.q !== b.q ? a.q - b.q : a.r - b.r));
  const owner = islandSharing[0]!;
  if (owner.q === hex.q && owner.r === hex.r) {
    return `${hexId(hex)}:${localV}`;
  }
  const lv = localVertexOnOwner(hex, localV, owner);
  return `${hexId(owner)}:${lv}`;
}

/**
 * Returns the two hexes sharing edge e of hex H.
 * Edge e of a pointy-top hex (vertices at 90+60v°) connects vertex e and (e+1)%6.
 * With this convention, edge e's neighbor is at direction (4-e+6)%6.
 */
function hexesSharingEdge(hex: HexCoord, e: number): HexCoord[] {
  const dir = (4 - e + 6) % 6;
  const neighbor = {
    q: hex.q + HEX_DIRECTIONS[dir]!.q,
    r: hex.r + HEX_DIRECTIONS[dir]!.r,
  };
  return [hex, neighbor];
}

/**
 * Canonical edge ID: owned by the lexicographically smallest hex that touches it.
 * Edge e of hex H connects vertices e and (e+1)%6.
 * The neighbor at direction e has this same edge as its edge (e+3)%6 (opposite edge).
 */
function canonicalEdgeId(hex: HexCoord, localE: number): EdgeId {
  const islandIds = new Set(CATAN_HEX_COORDS.map(hexId));
  const sharing = hexesSharingEdge(hex, localE).filter((h) =>
    islandIds.has(hexId(h)),
  );
  sharing.sort((a, b) => (a.q !== b.q ? a.q - b.q : a.r - b.r));
  const owner = sharing[0]!;
  if (owner.q === hex.q && owner.r === hex.r) {
    return `${hexId(hex)}:${localE}`;
  }
  // The opposite edge index: (localE + 3) % 6
  return `${hexId(owner)}:${(localE + 3) % 6}`;
}

// ─── Graph Object ─────────────────────────────────────────────────────────────

export interface CatanGraph {
  /** Set of all canonical vertex IDs on the island */
  vertices: Record<VertexId, true>;
  /** Set of all canonical edge IDs on the island */
  edges: Record<EdgeId, true>;
  /** Vertices adjacent to each vertex (2 or 3) */
  adjacentVertices: Record<VertexId, VertexId[]>;
  /** Edges emanating from each vertex (2 or 3) */
  edgesOfVertex: Record<VertexId, EdgeId[]>;
  /** The 2 vertices at the ends of each edge */
  verticesOfEdge: Record<EdgeId, [VertexId, VertexId]>;
  /** Hexes touching each vertex (1–3) */
  hexesOfVertex: Record<VertexId, HexId[]>;
  /** All 6 vertices of each hex */
  verticesOfHex: Record<HexId, VertexId[]>;
  /** All 6 edges of each hex */
  edgesOfHex: Record<HexId, EdgeId[]>;
}

let _graph: CatanGraph | null = null;

export function buildGraph(): CatanGraph {
  if (_graph) return _graph;

  const islandIds = new Set(CATAN_HEX_COORDS.map(hexId));
  const vertices: Record<VertexId, true> = {};
  const edges: Record<EdgeId, true> = {};
  const adjacentVerticesMap: Record<VertexId, Set<VertexId>> = {};
  const edgesOfVertexMap: Record<VertexId, Set<EdgeId>> = {};
  const verticesOfEdgeMap: Record<EdgeId, [VertexId, VertexId]> = {};
  const hexesOfVertexMap: Record<VertexId, Set<HexId>> = {};
  const verticesOfHexMap: Record<HexId, VertexId[]> = {};
  const edgesOfHexMap: Record<HexId, EdgeId[]> = {};

  for (const coord of CATAN_HEX_COORDS) {
    const hid = hexId(coord);
    const hexVerts: VertexId[] = [];
    const hexEdges: EdgeId[] = [];

    for (let v = 0; v < 6; v++) {
      const vid = canonicalVertexId(coord, v);
      hexVerts.push(vid);
      vertices[vid] = true;
      if (!hexesOfVertexMap[vid]) hexesOfVertexMap[vid] = new Set();
      hexesOfVertexMap[vid]!.add(hid);
    }

    for (let e = 0; e < 6; e++) {
      const eid = canonicalEdgeId(coord, e);
      hexEdges.push(eid);
      edges[eid] = true;

      // The two vertices of this edge are local vertices e and (e+1)%6
      const vA = canonicalVertexId(coord, e);
      const vB = canonicalVertexId(coord, (e + 1) % 6);

      if (!verticesOfEdgeMap[eid]) {
        verticesOfEdgeMap[eid] = [vA, vB];
      }

      // Record edges-of-vertex
      if (!edgesOfVertexMap[vA]) edgesOfVertexMap[vA] = new Set();
      if (!edgesOfVertexMap[vB]) edgesOfVertexMap[vB] = new Set();
      edgesOfVertexMap[vA]!.add(eid);
      edgesOfVertexMap[vB]!.add(eid);

      // Record adjacency
      if (!adjacentVerticesMap[vA]) adjacentVerticesMap[vA] = new Set();
      if (!adjacentVerticesMap[vB]) adjacentVerticesMap[vB] = new Set();
      adjacentVerticesMap[vA]!.add(vB);
      adjacentVerticesMap[vB]!.add(vA);
    }

    verticesOfHexMap[hid] = hexVerts;
    edgesOfHexMap[hid] = hexEdges;
  }

  _graph = {
    vertices,
    edges,
    adjacentVertices: Object.fromEntries(
      Object.entries(adjacentVerticesMap).map(([k, v]) => [k, [...v]]),
    ),
    edgesOfVertex: Object.fromEntries(
      Object.entries(edgesOfVertexMap).map(([k, v]) => [k, [...v]]),
    ),
    verticesOfEdge: verticesOfEdgeMap,
    hexesOfVertex: Object.fromEntries(
      Object.entries(hexesOfVertexMap).map(([k, v]) => [k, [...v]]),
    ),
    verticesOfHex: verticesOfHexMap,
    edgesOfHex: edgesOfHexMap,
  };

  return _graph;
}

// ─── Longest Road ─────────────────────────────────────────────────────────────

/**
 * Compute the longest continuous road for `playerId`.
 *
 * Rules:
 * - Only roads belonging to `playerId` count.
 * - Opponent buildings (settlements, cities) AND opponent knights on a vertex
 *   break the road: the DFS cannot pass through such a vertex.
 * - Own buildings do NOT break the road.
 * - DFS tracks visited EDGES (not vertices) to allow proper fork handling.
 */
export function computeLongestRoad(
  board: BoardState,
  graph: CatanGraph,
  playerId: PlayerId,
): number {
  // Collect all edges belonging to this player
  const playerEdges = new Set<EdgeId>(
    Object.entries(board.edges)
      .filter(([, r]) => r?.playerId === playerId)
      .map(([eid]) => eid as EdgeId),
  );

  if (playerEdges.size === 0) return 0;

  // Determine "break" vertices: vertices with an OPPONENT's building or knight
  const isBreakVertex = (vid: VertexId): boolean => {
    const building = board.vertices[vid];
    if (building && building.playerId !== playerId) return true;
    const knight = board.knights[vid];
    if (knight && knight.playerId !== playerId) return true;
    return false;
  };

  let best = 0;

  function dfs(currentVertex: VertexId, visitedEdges: Set<EdgeId>): void {
    const edges = graph.edgesOfVertex[currentVertex] ?? [];
    let extended = false;
    for (const eid of edges) {
      if (!playerEdges.has(eid)) continue;
      if (visitedEdges.has(eid)) continue;

      // Find the other vertex of this edge
      const [vA, vB] = graph.verticesOfEdge[eid]!;
      const nextVertex = vA === currentVertex ? vB! : vA!;

      // Can't traverse through opponent's piece
      if (isBreakVertex(nextVertex)) continue;

      extended = true;
      visitedEdges.add(eid);
      if (visitedEdges.size > best) best = visitedEdges.size;
      dfs(nextVertex, visitedEdges);
      visitedEdges.delete(eid);
    }
  }

  // Start DFS from every vertex that has at least one of this player's roads
  const startVertices = new Set<VertexId>();
  for (const eid of playerEdges) {
    const [vA, vB] = graph.verticesOfEdge[eid]!;
    if (vA) startVertices.add(vA);
    if (vB) startVertices.add(vB);
  }

  for (const sv of startVertices) {
    if (!isBreakVertex(sv)) {
      dfs(sv, new Set());
    }
  }

  return best;
}

// ─── Harbor Utility ───────────────────────────────────────────────────────────

/**
 * Get the best trade ratio for a player for a given resource/commodity.
 * Returns 2, 3, or 4.
 */
export function tradeRatio(
  board: BoardState,
  graph: CatanGraph,
  playerId: PlayerId,
  cardType: string,
): number {
  // Collect all vertices where this player has a settlement or city
  const playerVertices = new Set<VertexId>(
    Object.entries(board.vertices)
      .filter(([, b]) => b?.playerId === playerId)
      .map(([vid]) => vid as VertexId),
  );

  let bestRatio = 4;
  for (const harbor of board.harbors) {
    const [v1, v2] = harbor.vertices;
    if (playerVertices.has(v1) || playerVertices.has(v2)) {
      if (harbor.type === "generic") {
        bestRatio = Math.min(bestRatio, 3);
      } else if (harbor.type === cardType) {
        bestRatio = Math.min(bestRatio, 2);
      }
    }
  }
  return bestRatio;
}
