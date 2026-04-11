import { describe, it, expect } from 'vitest';
import {
  CATAN_HEX_COORDS,
  hexId,
  buildGraph,
  hexToPixel,
  computeLongestRoad,
} from '../../lib/catan/board.js';
import type { BoardState, HexId, VertexId, EdgeId } from '../../lib/catan/types.js';
import { emptyResources } from '../../lib/catan/types.js';

describe('CATAN_HEX_COORDS', () => {
  it('has exactly 19 hexes', () => {
    expect(CATAN_HEX_COORDS).toHaveLength(19);
  });

  it('all coords are within cube-radius 2 (max |q|, |r|, |q+r| <= 2)', () => {
    for (const { q, r } of CATAN_HEX_COORDS) {
      expect(Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r))).toBeLessThanOrEqual(2);
    }
  });

  it('has no duplicate coords', () => {
    const ids = new Set(CATAN_HEX_COORDS.map(c => `${c.q},${c.r}`));
    expect(ids.size).toBe(19);
  });
});

describe('buildGraph', () => {
  const graph = buildGraph();

  it('produces exactly 54 unique vertices', () => {
    expect(Object.keys(graph.vertices).length).toBe(54);
  });

  it('produces exactly 72 unique edges', () => {
    expect(Object.keys(graph.edges).length).toBe(72);
  });

  it('each vertex has 2 or 3 adjacent vertices', () => {
    for (const vid of Object.keys(graph.vertices)) {
      const adj = graph.adjacentVertices[vid as VertexId] ?? [];
      expect(adj.length, `vertex ${vid}`).toBeGreaterThanOrEqual(2);
      expect(adj.length, `vertex ${vid}`).toBeLessThanOrEqual(3);
    }
  });

  it('each vertex touches 1, 2, or 3 hexes', () => {
    for (const vid of Object.keys(graph.vertices)) {
      const hexes = graph.hexesOfVertex[vid as VertexId] ?? [];
      expect(hexes.length, `vertex ${vid}`).toBeGreaterThanOrEqual(1);
      expect(hexes.length, `vertex ${vid}`).toBeLessThanOrEqual(3);
    }
  });

  it('each edge connects exactly 2 vertices', () => {
    for (const eid of Object.keys(graph.edges)) {
      const vs = graph.verticesOfEdge[eid as EdgeId] ?? [];
      expect(vs.length, `edge ${eid}`).toBe(2);
    }
  });

  it('adjacency is symmetric', () => {
    for (const [vid, neighbors] of Object.entries(graph.adjacentVertices)) {
      for (const nid of neighbors) {
        const backRef = graph.adjacentVertices[nid as VertexId] ?? [];
        expect(backRef, `${nid} should reference ${vid}`).toContain(vid);
      }
    }
  });

  it('each vertex has 2 or 3 edges', () => {
    for (const vid of Object.keys(graph.vertices)) {
      const edges = graph.edgesOfVertex[vid as VertexId] ?? [];
      expect(edges.length, `vertex ${vid}`).toBeGreaterThanOrEqual(2);
      expect(edges.length, `vertex ${vid}`).toBeLessThanOrEqual(3);
    }
  });

  it('no two edges share the same vertex pair', () => {
    const seen = new Set<string>();
    for (const [eid, [vA, vB]] of Object.entries(graph.verticesOfEdge)) {
      const key = [vA, vB].sort().join('|');
      expect(seen, `duplicate edge pair at ${eid}: ${vA} — ${vB}`).not.toContain(key);
      seen.add(key);
    }
  });

  it('edgesOfVertex and verticesOfEdge are consistent', () => {
    for (const [vid, edges] of Object.entries(graph.edgesOfVertex)) {
      for (const eid of edges) {
        const [vA, vB] = graph.verticesOfEdge[eid as EdgeId] ?? [];
        expect(
          vA === vid || vB === vid,
          `edge ${eid} in edgesOfVertex[${vid}] but verticesOfEdge[${eid}] = [${vA}, ${vB}]`
        ).toBe(true);
      }
    }
  });
});

describe('hexToPixel', () => {
  it('returns distinct positions for all 19 hexes (size=100)', () => {
    const SIZE = 100;
    const positions = CATAN_HEX_COORDS.map(c => {
      const p = hexToPixel(c, SIZE);
      return `${Math.round(p.x)},${Math.round(p.y)}`;
    });
    const unique = new Set(positions);
    expect(unique.size).toBe(19);
  });

  it('center hex (0,0) maps to (0,0)', () => {
    const p = hexToPixel({ q: 0, r: 0 }, 100);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
  });
});

// ─── Helpers for computeLongestRoad tests ─────────────────────────────────────

function emptyBoard(): BoardState {
  const graph = buildGraph();
  const hexes: Record<HexId, any> = {};
  for (const coord of CATAN_HEX_COORDS) {
    const id = hexId(coord);
    hexes[id] = { id, coord, terrain: 'desert', number: null, hasRobber: false };
  }
  return {
    hexes,
    vertices: Object.fromEntries(Object.keys(graph.vertices).map(v => [v, null])),
    edges: Object.fromEntries(Object.keys(graph.edges).map(e => [e, null])),
    knights: Object.fromEntries(Object.keys(graph.vertices).map(v => [v, null])),
    harbors: [],
    merchantHex: null,
    merchantOwner: null,
  };
}

describe('computeLongestRoad', () => {
  const graph = buildGraph();

  it('returns 0 when no roads exist', () => {
    const board = emptyBoard();
    expect(computeLongestRoad(board, graph, 'p1')).toBe(0);
  });

  it('counts a simple chain correctly', () => {
    const board = emptyBoard();
    // Build a 5-edge chain along the first few edges
    const edges = Object.keys(graph.edges) as EdgeId[];
    // Find a chain of 5 connected edges for player p1
    const chain = findChain(graph, edges, 5);
    for (const eid of chain) {
      board.edges[eid] = { playerId: 'p1' };
    }
    expect(computeLongestRoad(board, graph, 'p1')).toBeGreaterThanOrEqual(5);
  });

  it('breaks at opponent building', () => {
    const board = emptyBoard();
    const edges = Object.keys(graph.edges) as EdgeId[];
    const chain = findChain(graph, edges, 6);
    for (const eid of chain) {
      board.edges[eid] = { playerId: 'p1' };
    }
    // Place opponent settlement at the middle vertex to break the chain
    const midVertex = findChainMidVertex(graph, chain);
    if (midVertex) {
      board.vertices[midVertex] = { type: 'settlement', playerId: 'p2' };
    }
    // Road should now be split — each half < 6
    expect(computeLongestRoad(board, graph, 'p1')).toBeLessThan(6);
  });

  it('takes the longer branch at a fork', () => {
    const board = emptyBoard();
    // Build a Y-shape: 4 edges along one branch + 1 edge along another
    const edges = Object.keys(graph.edges) as EdgeId[];
    const longBranch = findChain(graph, edges, 4);
    for (const eid of longBranch) {
      board.edges[eid] = { playerId: 'p1' };
    }
    // Find a vertex at one end and attach 1 more edge in another direction
    const startVertex = graph.verticesOfEdge[longBranch[0]!]![0]!;
    const extraEdge = graph.edgesOfVertex[startVertex]?.find(
      e => !longBranch.includes(e)
    );
    if (extraEdge) {
      board.edges[extraEdge] = { playerId: 'p1' };
    }
    // Longest path should still be at least 4 (the long branch)
    expect(computeLongestRoad(board, graph, 'p1')).toBeGreaterThanOrEqual(4);
  });
});

// ─── Test utilities ───────────────────────────────────────────────────────────

function findChain(graph: ReturnType<typeof buildGraph>, allEdges: EdgeId[], length: number): EdgeId[] {
  // BFS/greedy: find a chain of `length` connected edges
  for (const startEdge of allEdges) {
    const chain = growChain(graph, [startEdge], length);
    if (chain.length === length) return chain;
  }
  return [];
}

function growChain(graph: ReturnType<typeof buildGraph>, chain: EdgeId[], target: number): EdgeId[] {
  if (chain.length === target) return chain;
  const lastEdge = chain[chain.length - 1]!;
  const [v1, v2] = graph.verticesOfEdge[lastEdge]!;
  // try extending from v2 (the "forward" end)
  for (const nextEdge of (graph.edgesOfVertex[v2!] ?? [])) {
    if (!chain.includes(nextEdge)) {
      const extended = growChain(graph, [...chain, nextEdge], target);
      if (extended.length === target) return extended;
    }
  }
  return chain;
}

function findChainMidVertex(graph: ReturnType<typeof buildGraph>, chain: EdgeId[]): VertexId | null {
  if (chain.length < 2) return null;
  const midIdx = Math.floor(chain.length / 2);
  const e1 = chain[midIdx - 1]!;
  const e2 = chain[midIdx]!;
  const [v1a, v1b] = graph.verticesOfEdge[e1]!;
  const [v2a, v2b] = graph.verticesOfEdge[e2]!;
  // find the shared vertex
  if (v1a === v2a || v1a === v2b) return v1a ?? null;
  if (v1b === v2a || v1b === v2b) return v1b ?? null;
  return null;
}
