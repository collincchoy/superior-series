import { describe, it, expect } from 'vitest';
import { computeValidTargets } from '../../lib/catan/validTargets.js';
import { createInitialState, applyAction } from '../../lib/catan/game.js';
import { buildGraph, CATAN_HEX_COORDS, hexId } from '../../lib/catan/board.js';
import type { GameState, PlayerId, VertexId, EdgeId } from '../../lib/catan/types.js';

const graph = buildGraph();

function makePlayers(count = 2) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}` as PlayerId,
    name: `Player ${i + 1}`,
    color: ['#e74c3c', '#3498db', '#f39c12', '#2ecc71'][i]!,
    isBot: false,
  }));
}

function anyVertex(state: GameState): VertexId {
  return Object.keys(graph.vertices)[0] as VertexId;
}

function placeFirstSettlement(state: GameState, pid: PlayerId): { state: GameState; vid: VertexId } {
  const vid = Object.keys(graph.vertices)[0] as VertexId;
  const s = applyAction(state, { type: 'PLACE_BUILDING', pid, vid, building: 'settlement' });
  return { state: s, vid };
}

function placeRoadAdjacentTo(state: GameState, pid: PlayerId, vid: VertexId): GameState {
  const eid = (graph.edgesOfVertex[vid] ?? [])[0];
  if (!eid) throw new Error('no edge found');
  return applyAction(state, { type: 'PLACE_ROAD', pid: pid, eid });
}

describe('computeValidTargets', () => {
  describe('not my turn', () => {
    it('returns empty sets when it is not the local player\'s turn', () => {
      const state = createInitialState(makePlayers(2));
      // state.currentPlayerId is 'p1', so 'p2' is not their turn
      const targets = computeValidTargets(state, 'p2', null);
      expect(targets.validVertices.size).toBe(0);
      expect(targets.validEdges.size).toBe(0);
      expect(targets.validHexes.size).toBe(0);
    });

    it('returns displaced-knight destinations for the acting player in shared response phases', () => {
      const state = createInitialState(makePlayers(2));
      const edgeId = Object.keys(graph.edges)[0] as EdgeId;
      const [from, to] = graph.verticesOfEdge[edgeId]!;
      const displacedState: GameState = {
        ...state,
        phase: 'KNIGHT_DISPLACE_RESPONSE',
        currentPlayerId: 'p1',
        board: {
          ...state.board,
          edges: { ...state.board.edges, [edgeId]: { playerId: 'p2' } },
          knights: {
            ...state.board.knights,
            [from]: { playerId: 'p1', strength: 2, active: false },
          },
        },
        pendingDisplace: {
          displacerPlayerId: 'p1',
          displacedPlayerId: 'p2',
          displacedKnightVertex: from,
          displacedKnightStrength: 1,
        },
      };

      const targets = computeValidTargets(displacedState, 'p2', null);
      expect(targets.validVertices.has(to)).toBe(true);
      expect(targets.validEdges.size).toBe(0);
      expect(targets.validHexes.size).toBe(0);
    });
  });

  describe('SETUP_R1_SETTLEMENT phase', () => {
    it('returns valid settlement vertices for current player', () => {
      const state = createInitialState(makePlayers(2));
      expect(state.phase).toBe('SETUP_R1_SETTLEMENT');
      const targets = computeValidTargets(state, 'p1', null);
      expect(targets.validVertices.size).toBeGreaterThan(0);
      expect(targets.validEdges.size).toBe(0);
      expect(targets.validHexes.size).toBe(0);
    });

    it('all vertices are valid on an empty board', () => {
      const state = createInitialState(makePlayers(2));
      const targets = computeValidTargets(state, 'p1', null);
      // Every vertex on an empty board should be placeable
      expect(targets.validVertices.size).toBe(Object.keys(graph.vertices).length);
    });
  });

  describe('SETUP_R1_ROAD phase', () => {
    it('returns edges adjacent to own settlement only', () => {
      let state = createInitialState(makePlayers(2));
      const vid = Object.keys(graph.vertices)[0] as VertexId;
      state = applyAction(state, { type: 'PLACE_BUILDING', pid: 'p1', vid, building: 'settlement' });
      expect(state.phase).toBe('SETUP_R1_ROAD');

      const targets = computeValidTargets(state, 'p1', null);
      expect(targets.validEdges.size).toBeGreaterThan(0);
      expect(targets.validVertices.size).toBe(0);

      // All valid edges should be adjacent to the placed settlement
      const adjacentEdges = new Set(graph.edgesOfVertex[vid] ?? []);
      for (const eid of targets.validEdges) {
        expect(adjacentEdges.has(eid)).toBe(true);
      }
    });
  });

  describe('SETUP_R2_ROAD phase', () => {
    it('returns edges adjacent to own city only, not the R1 settlement', () => {
      let state = createInitialState(makePlayers(2));
      const vids = Object.keys(graph.vertices) as VertexId[];
      const r1SettlementVid = vids[0]!;
      const r2CityVid = vids[10]!; // far enough away to have distinct edges

      // R1: p1 places settlement, then road
      state = applyAction(state, { type: 'PLACE_BUILDING', pid: 'p1', vid: r1SettlementVid, building: 'settlement' });
      const r1RoadEid = (graph.edgesOfVertex[r1SettlementVid] ?? [])[0]!;
      state = applyAction(state, { type: 'PLACE_ROAD', pid: 'p1', eid: r1RoadEid });
      // R1: p2 places settlement, then road
      state = applyAction(state, { type: 'PLACE_BUILDING', pid: 'p2', vid: vids[5]!, building: 'settlement' });
      state = applyAction(state, { type: 'PLACE_ROAD', pid: 'p2', eid: (graph.edgesOfVertex[vids[5]!] ?? [])[0]! });
      // R2: p2 places city, then road (reverse order)
      state = applyAction(state, { type: 'PLACE_BUILDING', pid: 'p2', vid: vids[15]!, building: 'city' });
      state = applyAction(state, { type: 'PLACE_ROAD', pid: 'p2', eid: (graph.edgesOfVertex[vids[15]!] ?? [])[0]! });
      // R2: p1 places city
      state = applyAction(state, { type: 'PLACE_BUILDING', pid: 'p1', vid: r2CityVid, building: 'city' });
      expect(state.phase).toBe('SETUP_R2_ROAD');

      const targets = computeValidTargets(state, 'p1', null);
      expect(targets.validEdges.size).toBeGreaterThan(0);

      const r2CityEdges = new Set(graph.edgesOfVertex[r2CityVid] ?? []);
      const r1SettlementEdges = new Set(graph.edgesOfVertex[r1SettlementVid] ?? []);

      // Every valid edge must be adjacent to the R2 city
      for (const eid of targets.validEdges) {
        expect(r2CityEdges.has(eid)).toBe(true);
      }
      // Edges exclusively adjacent to R1 settlement (not R2 city) must NOT be valid
      for (const eid of r1SettlementEdges) {
        if (!r2CityEdges.has(eid)) {
          expect(targets.validEdges.has(eid)).toBe(false);
        }
      }
    });
  });

  describe('ROBBER_MOVE phase', () => {
    it('returns all non-robber hexes as valid', () => {
      // Get to robber move: play through setup, roll a 7
      let state = createInitialState(makePlayers(2));
      // Quickly get through setup
      const vids = Object.keys(graph.vertices) as VertexId[];
      state = applyAction(state, { type: 'PLACE_BUILDING', pid: 'p1', vid: vids[0]!, building: 'settlement' });
      const e1 = (graph.edgesOfVertex[vids[0]!] ?? [])[0]!;
      state = applyAction(state, { type: 'PLACE_ROAD', pid: 'p1', eid: e1 });
      state = applyAction(state, { type: 'PLACE_BUILDING', pid: 'p2', vid: vids[5]!, building: 'settlement' });
      const e2 = (graph.edgesOfVertex[vids[5]!] ?? [])[0]!;
      state = applyAction(state, { type: 'PLACE_ROAD', pid: 'p2', eid: e2 });
      // Round 2
      state = applyAction(state, { type: 'PLACE_BUILDING', pid: 'p2', vid: vids[10]!, building: 'city' });
      const e3 = (graph.edgesOfVertex[vids[10]!] ?? [])[0]!;
      state = applyAction(state, { type: 'PLACE_ROAD', pid: 'p2', eid: e3 });
      state = applyAction(state, { type: 'PLACE_BUILDING', pid: 'p1', vid: vids[15]!, building: 'city' });
      const e4 = (graph.edgesOfVertex[vids[15]!] ?? [])[0]!;
      state = applyAction(state, { type: 'PLACE_ROAD', pid: 'p1', eid: e4 });

      expect(state.phase).toBe('ROLL_DICE');
      // Force robber phase by injecting state directly
      const robberState: GameState = { ...state, phase: 'ROBBER_MOVE' };

      const targets = computeValidTargets(robberState, 'p1', null);
      expect(targets.validHexes.size).toBeGreaterThan(0);
      // Hexes with robber should not be in valid set
      const robberHexes = Object.values(robberState.board.hexes).filter(h => h.hasRobber).map(h => h.id);
      for (const hid of robberHexes) {
        expect(targets.validHexes.has(hid)).toBe(false);
      }
    });
  });

  describe('ACTION phase with pending actions', () => {
    it('returns empty sets with null pending action in ACTION phase', () => {
      let state = createInitialState(makePlayers(2));
      // Force to ACTION phase
      const actionState: GameState = { ...state, phase: 'ACTION', currentPlayerId: 'p1' };
      const targets = computeValidTargets(actionState, 'p1', null);
      expect(targets.validVertices.size).toBe(0);
      expect(targets.validEdges.size).toBe(0);
    });

    it('build_road returns only valid road edges', () => {
      let state = createInitialState(makePlayers(2));
      const vids = Object.keys(graph.vertices) as VertexId[];
      // Place a settlement to enable road building
      state = applyAction(state, { type: 'PLACE_BUILDING', pid: 'p1', vid: vids[0]!, building: 'settlement' });
      const e1 = (graph.edgesOfVertex[vids[0]!] ?? [])[0]!;
      state = applyAction(state, { type: 'PLACE_ROAD', pid: 'p1', eid: e1 });
      state = applyAction(state, { type: 'PLACE_BUILDING', pid: 'p2', vid: vids[5]!, building: 'settlement' });
      const e2 = (graph.edgesOfVertex[vids[5]!] ?? [])[0]!;
      state = applyAction(state, { type: 'PLACE_ROAD', pid: 'p2', eid: e2 });
      state = applyAction(state, { type: 'PLACE_BUILDING', pid: 'p2', vid: vids[10]!, building: 'city' });
      const e3 = (graph.edgesOfVertex[vids[10]!] ?? [])[0]!;
      state = applyAction(state, { type: 'PLACE_ROAD', pid: 'p2', eid: e3 });
      state = applyAction(state, { type: 'PLACE_BUILDING', pid: 'p1', vid: vids[15]!, building: 'city' });
      const e4 = (graph.edgesOfVertex[vids[15]!] ?? [])[0]!;
      state = applyAction(state, { type: 'PLACE_ROAD', pid: 'p1', eid: e4 });

      // Give p1 enough resources and set to ACTION phase
      const actionState: GameState = {
        ...state,
        phase: 'ACTION',
        currentPlayerId: 'p1',
        players: {
          ...state.players,
          p1: { ...state.players['p1']!, resources: { brick: 5, lumber: 5, ore: 5, grain: 5, wool: 5, cloth: 0, coin: 0, paper: 0 } },
        },
      };

      const targets = computeValidTargets(actionState, 'p1', { type: 'build_road' });
      expect(targets.validEdges.size).toBeGreaterThan(0);
      expect(targets.validVertices.size).toBe(0);
    });
  });
});
