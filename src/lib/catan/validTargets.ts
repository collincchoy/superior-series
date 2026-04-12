/**
 * validTargets.ts — Computes which board spots are valid click targets
 * given the current game state and pending action.
 * Pure — no DOM, no side effects.
 */

import type { GameState, PlayerId, VertexId, EdgeId, HexId } from "./types.js";
import {
  canBuildRoad,
  canBuildSettlement,
  canBuildCity,
  canBuildCityWall,
  canRecruitKnight,
  canPromoteKnight,
  canActivateKnight,
  canRelocateDisplacedKnight,
  canPlaceSettlement,
  canPlaceFreeRoad,
  canPromoteFreeKnight,
} from "./rules.js";
import { buildGraph } from "./board.js";
import { isPlayerActing } from "./turnActors.js";

const graph = buildGraph();

export type PendingAction =
  | { type: "build_road" }
  | { type: "build_settlement" }
  | { type: "build_city" }
  | { type: "build_city_wall" }
  | { type: "recruit_knight" }
  | { type: "promote_knight" }
  | { type: "activate_knight" };

export interface ValidTargets {
  validVertices: Set<VertexId>;
  validEdges: Set<EdgeId>;
  validHexes: Set<HexId>;
}

export function computeValidTargets(
  state: GameState,
  localPid: PlayerId,
  pending: PendingAction | null,
): ValidTargets {
  const validVertices = new Set<VertexId>();
  const validEdges = new Set<EdgeId>();
  const validHexes = new Set<HexId>();

  const isMyTurn = isPlayerActing(state, localPid);
  if (!isMyTurn) return { validVertices, validEdges, validHexes };

  const { board } = state;
  const me = state.players[localPid]!;
  const pid = localPid;

  if (state.phase === "ACTION" && pending) {
    switch (pending.type) {
      case "build_road":
        Object.keys(graph.edges).forEach((eid) => {
          if (canBuildRoad(board, graph, me, eid as EdgeId))
            validEdges.add(eid as EdgeId);
        });
        break;
      case "build_settlement":
        Object.keys(graph.vertices).forEach((vid) => {
          if (canBuildSettlement(board, graph, me, vid as VertexId))
            validVertices.add(vid as VertexId);
        });
        break;
      case "build_city":
        Object.entries(board.vertices).forEach(([vid, b]) => {
          if (
            b?.type === "settlement" &&
            b.playerId === pid &&
            canBuildCity(board, me, vid as VertexId)
          )
            validVertices.add(vid as VertexId);
        });
        break;
      case "build_city_wall":
        Object.entries(board.vertices).forEach(([vid, b]) => {
          if (
            b?.type === "city" &&
            b.playerId === pid &&
            !b.hasWall &&
            canBuildCityWall(board, me, vid as VertexId)
          )
            validVertices.add(vid as VertexId);
        });
        break;
      case "recruit_knight":
        Object.keys(graph.vertices).forEach((vid) => {
          if (canRecruitKnight(board, graph, me, vid as VertexId))
            validVertices.add(vid as VertexId);
        });
        break;
      case "promote_knight":
        Object.entries(board.knights).forEach(([vid, k]) => {
          if (
            k?.playerId === pid &&
            canPromoteKnight(board, me, vid as VertexId)
          )
            validVertices.add(vid as VertexId);
        });
        break;
      case "activate_knight":
        Object.entries(board.knights).forEach(([vid, k]) => {
          if (
            k?.playerId === pid &&
            canActivateKnight(board, me, vid as VertexId)
          )
            validVertices.add(vid as VertexId);
        });
        break;
    }
  } else if (state.phase === "ROBBER_MOVE") {
    Object.values(state.board.hexes).forEach((h) => {
      if (!h.hasRobber) validHexes.add(h.id);
    });
  } else if (state.phase === "KNIGHT_DISPLACE_RESPONSE") {
    const from = state.pendingDisplace?.displacedKnightVertex;
    if (from && state.pendingDisplace?.displacedPlayerId === pid) {
      Object.keys(graph.vertices).forEach((vid) => {
        if (
          canRelocateDisplacedKnight(board, graph, pid, from, vid as VertexId)
        ) {
          validVertices.add(vid as VertexId);
        }
      });
    }
  } else if (
    state.phase === "SETUP_R1_ROAD" ||
    state.phase === "SETUP_R2_ROAD"
  ) {
    computeSetupRoadEdges(state, pid, validEdges);
  } else if (
    state.phase === "SETUP_R1_SETTLEMENT" ||
    state.phase === "SETUP_R2_CITY"
  ) {
    Object.keys(graph.vertices).forEach((vid) => {
      if (canPlaceSettlement(state.board, graph, pid, vid as VertexId, true))
        validVertices.add(vid as VertexId);
    });
  }

  // Free roads (Road Building / Diplomacy own-road)
  if (state.pendingFreeRoads?.pid === localPid) {
    Object.keys(graph.edges).forEach((eid) => {
      if (canPlaceFreeRoad(board, graph, me, eid as EdgeId))
        validEdges.add(eid as EdgeId);
    });
  }

  // Free knight promotions (Smithing)
  if (state.pendingKnightPromotions?.pid === localPid) {
    Object.entries(board.knights).forEach(([vid, k]) => {
      if (
        k?.playerId === pid &&
        canPromoteFreeKnight(board, me, vid as VertexId)
      )
        validVertices.add(vid as VertexId);
    });
  }

  return { validVertices, validEdges, validHexes };
}

function computeSetupRoadEdges(
  state: GameState,
  pid: PlayerId,
  validEdges: Set<EdgeId>,
) {
  const { board, setupLastPlacedVertex } = state;
  if (!setupLastPlacedVertex) return;

  for (const eid of graph.edgesOfVertex[setupLastPlacedVertex] ?? []) {
    if (board.edges[eid] === null) validEdges.add(eid);
  }
}
