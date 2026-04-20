/**
 * validTargets.ts — Computes which board spots are valid click targets
 * given the current game state and pending action.
 * Pure — no DOM, no side effects.
 */

import type {
  GameState,
  PlayerId,
  VertexId,
  EdgeId,
  HexId,
} from "./types.js";
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
  canMoveKnight,
  canDisplaceKnight,
  canChaseRobber,
  isOnPlayerNetwork,
  isOpenRoad,
  hasKnightUpTo,
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
  | { type: "activate_knight" }
  // Progress card board selections
  | { type: "progress_select_vertex"; card: "Engineering" | "Medicine" }
  | { type: "progress_select_knight"; card: "Intrigue" | "Treason" }
  | { type: "progress_select_hex"; card: "Merchant" | "Taxation" }
  | { type: "progress_select_edge"; card: "Diplomacy" }
  | { type: "progress_select_hex_pair"; card: "Invention"; picked: HexId[] }
  // Knight move (two-step)
  | { type: "move_knight_from" }
  | { type: "move_knight_to"; from: VertexId }
  // Knight displace (two-step)
  | { type: "displace_knight_from" }
  | { type: "displace_knight_to"; from: VertexId }
  // Chase robber (two-step)
  | { type: "chase_robber_from" }
  | { type: "chase_robber_hex"; knight: VertexId };

export type PendingAdminAction =
  | { type: "admin_move_road_pick_from"; unsafe?: boolean; reason?: string }
  | {
      type: "admin_move_road_pick_to";
      from: EdgeId;
      pid: PlayerId;
      unsafe?: boolean;
      reason?: string;
    }
  | {
      type: "admin_move_building_pick_from";
      unsafe?: boolean;
      reason?: string;
    }
  | {
      type: "admin_move_building_pick_to";
      from: VertexId;
      pid: PlayerId;
      unsafe?: boolean;
      reason?: string;
    }
  | {
      type: "admin_move_knight_pick_from";
      unsafe?: boolean;
      reason?: string;
    }
  | {
      type: "admin_move_knight_pick_to";
      from: VertexId;
      pid: PlayerId;
      unsafe?: boolean;
      reason?: string;
    }
  | { type: "admin_swap_number_pick_a"; reason?: string }
  | { type: "admin_swap_number_pick_b"; hidA: HexId; reason?: string }
  | { type: "admin_swap_hex_pick_a"; reason?: string }
  | { type: "admin_swap_hex_pick_b"; hidA: HexId; reason?: string };

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
  const activatedThisTurn = new Set(state.knightsActivatedThisTurn);

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
      case "progress_select_vertex":
        if (pending.card === "Engineering") {
          // Engineering: own cities without walls
          Object.entries(board.vertices).forEach(([vid, b]) => {
            if (b?.type === "city" && b.playerId === pid && !b.hasWall)
              validVertices.add(vid as VertexId);
          });
        } else if (pending.card === "Medicine") {
          // Medicine: own settlements
          Object.entries(board.vertices).forEach(([vid, b]) => {
            if (b?.type === "settlement" && b.playerId === pid)
              validVertices.add(vid as VertexId);
          });
        }
        break;
      case "progress_select_knight":
        if (pending.card === "Intrigue") {
          // Intrigue: opponent knights on player's network
          Object.entries(board.knights).forEach(([vid, k]) => {
            if (
              k?.playerId !== pid &&
              isOnPlayerNetwork(board, graph, pid, vid as VertexId)
            ) {
              validVertices.add(vid as VertexId);
            }
          });
        } else if (pending.card === "Treason") {
          // Treason: any opponent knight
          Object.entries(board.knights).forEach(([vid, k]) => {
            if (k?.playerId !== pid) {
              validVertices.add(vid as VertexId);
            }
          });
        }
        break;
      case "progress_select_hex":
        if (pending.card === "Merchant") {
          // Merchant: hexes adjacent to own buildings
          const myVertices = new Set<VertexId>();
          Object.entries(board.vertices).forEach(([vid, b]) => {
            if (b?.playerId === pid) myVertices.add(vid as VertexId);
          });
          Object.keys(board.hexes).forEach((hid) => {
            const hexVertices = graph.verticesOfHex[hid as HexId] ?? [];
            if (hexVertices.some((v) => myVertices.has(v))) {
              validHexes.add(hid as HexId);
            }
          });
        } else if (pending.card === "Taxation") {
          // Taxation: all non-desert hexes when robber active
          if (state.barbarian.robberActive) {
            Object.values(board.hexes).forEach((h) => {
              if (h.terrain !== "desert") validHexes.add(h.id);
            });
          }
        }
        break;
      case "progress_select_edge":
        if (pending.card === "Diplomacy") {
          // Diplomacy: open opponent roads (roads with a disconnected endpoint)
          Object.entries(board.edges).forEach(([eid, road]) => {
            if (
              road &&
              road.playerId !== pid &&
              isOpenRoad(board, graph, eid as EdgeId)
            ) {
              validEdges.add(eid as EdgeId);
            }
          });
        }
        break;
      case "progress_select_hex_pair":
        if (pending.card === "Invention") {
          // Invention: hexes with numbers not in [2,6,8,12], excluding picked
          const picked = new Set(pending.picked);
          const invalidNumbers = new Set([2, 6, 8, 12]);
          Object.values(board.hexes).forEach((h) => {
            if (
              h.number !== null &&
              !invalidNumbers.has(h.number) &&
              !picked.has(h.id)
            ) {
              validHexes.add(h.id);
            }
          });
        }
        break;
      case "move_knight_from":
        // Move knight: own active knights
        Object.entries(board.knights).forEach(([vid, k]) => {
          if (
            k?.playerId === pid &&
            k.active &&
            !activatedThisTurn.has(vid as VertexId)
          ) {
            validVertices.add(vid as VertexId);
          }
        });
        break;
      case "move_knight_to":
        // Move knight: valid destinations for this knight
        Object.keys(graph.vertices).forEach((vid) => {
          if (canMoveKnight(board, graph, pid, pending.from, vid as VertexId)) {
            validVertices.add(vid as VertexId);
          }
        });
        break;
      case "displace_knight_from":
        // Displace: own active knights that can reach and beat at least one opponent knight
        Object.entries(board.knights).forEach(([fromVid, k]) => {
          if (
            !k ||
            k.playerId !== pid ||
            !k.active ||
            activatedThisTurn.has(fromVid as VertexId)
          ) {
            return;
          }
          const canDisplace = Object.entries(board.knights).some(
            ([toVid, t]) =>
              t !== null &&
              t.playerId !== pid &&
              canDisplaceKnight(
                board,
                graph,
                pid,
                fromVid as VertexId,
                toVid as VertexId,
              ),
          );
          if (canDisplace) validVertices.add(fromVid as VertexId);
        });
        break;
      case "displace_knight_to":
        // Displace: reachable opponent knights weaker than our knight at `from`
        Object.entries(board.knights).forEach(([toVid, t]) => {
          if (t === null || t.playerId === pid) return;
          if (
            canDisplaceKnight(
              board,
              graph,
              pid,
              pending.from,
              toVid as VertexId,
            )
          ) {
            validVertices.add(toVid as VertexId);
          }
        });
        break;
      case "chase_robber_from":
        // Chase robber: own active knights adjacent to the robber hex
        Object.entries(board.knights).forEach(([vid, k]) => {
          if (
            k?.playerId === pid &&
            !activatedThisTurn.has(vid as VertexId) &&
            canChaseRobber(board, graph, pid, vid as VertexId)
          ) {
            validVertices.add(vid as VertexId);
          }
        });
        break;
      case "chase_robber_hex":
        // All non-robber hexes are valid destinations
        Object.values(board.hexes).forEach((h) => {
          if (!h.hasRobber) validHexes.add(h.id);
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

  // Treason placement step
  if (state.pendingTreason?.pid === localPid) {
    if (hasKnightUpTo(me, state.pendingTreason.maxStrength)) {
      Object.keys(graph.vertices).forEach((vid) => {
        if (
          !board.vertices[vid as VertexId] &&
          !board.knights[vid as VertexId] &&
          isOnPlayerNetwork(board, graph, pid, vid as VertexId)
        ) {
          validVertices.add(vid as VertexId);
        }
      });
    }
  }

  return { validVertices, validEdges, validHexes };
}

export function computeAdminTargets(
  state: GameState,
  pending: PendingAdminAction | null,
): ValidTargets {
  const validVertices = new Set<VertexId>();
  const validEdges = new Set<EdgeId>();
  const validHexes = new Set<HexId>();

  if (!pending) return { validVertices, validEdges, validHexes };

  switch (pending.type) {
    case "admin_move_road_pick_from":
      Object.entries(state.board.edges).forEach(([eid, road]) => {
        if (road) validEdges.add(eid as EdgeId);
      });
      break;
    case "admin_move_road_pick_to":
      Object.entries(state.board.edges).forEach(([eid, road]) => {
        if (!road) validEdges.add(eid as EdgeId);
      });
      break;
    case "admin_move_building_pick_from":
      Object.entries(state.board.vertices).forEach(([vid, b]) => {
        if (b) validVertices.add(vid as VertexId);
      });
      break;
    case "admin_move_building_pick_to":
      Object.entries(state.board.vertices).forEach(([vid, b]) => {
        if (!b && !state.board.knights[vid]) validVertices.add(vid as VertexId);
      });
      break;
    case "admin_move_knight_pick_from":
      Object.entries(state.board.knights).forEach(([vid, k]) => {
        if (k) validVertices.add(vid as VertexId);
      });
      break;
    case "admin_move_knight_pick_to":
      Object.entries(state.board.knights).forEach(([vid, k]) => {
        if (!k && !state.board.vertices[vid])
          validVertices.add(vid as VertexId);
      });
      break;
    case "admin_swap_number_pick_a":
      Object.values(state.board.hexes).forEach((h) => {
        if (h.number !== null) validHexes.add(h.id);
      });
      break;
    case "admin_swap_number_pick_b":
      Object.values(state.board.hexes).forEach((h) => {
        if (h.number !== null && h.id !== pending.hidA) validHexes.add(h.id);
      });
      break;
    case "admin_swap_hex_pick_a":
      Object.values(state.board.hexes).forEach((h) => {
        validHexes.add(h.id);
      });
      break;
    case "admin_swap_hex_pick_b":
      Object.values(state.board.hexes).forEach((h) => {
        if (h.id !== pending.hidA) validHexes.add(h.id);
      });
      break;
  }

  return { validVertices, validEdges, validHexes };
}

function computeSetupRoadEdges(
  state: GameState,
  _pid: PlayerId,
  validEdges: Set<EdgeId>,
) {
  const { board, setupLastPlacedVertex } = state;
  if (!setupLastPlacedVertex) return;

  for (const eid of graph.edgesOfVertex[setupLastPlacedVertex] ?? []) {
    if (board.edges[eid] === null) validEdges.add(eid);
  }
}
