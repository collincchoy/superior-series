import type { CatanGraph } from "./board.js";
import type { GameState, HexId, PlayerId } from "./types.js";

function resourceCardCount(state: GameState, pid: PlayerId): number {
  const player = state.players[pid];
  if (!player) return 0;
  return Object.values(player.resources).reduce((sum, count) => sum + (count ?? 0), 0);
}

/**
 * Returns adjacent opponent player ids that can legally be robbed from a robber target hex.
 * Players are returned in player-order for deterministic UI defaults.
 */
export function getRobbableVictimPids(
  state: GameState,
  actingPid: PlayerId,
  hid: HexId,
  graph: CatanGraph,
): PlayerId[] {
  const adjacentOwners = new Set<PlayerId>();
  for (const vid of graph.verticesOfHex[hid] ?? []) {
    const building = state.board.vertices[vid];
    if (!building || building.playerId === actingPid) continue;
    adjacentOwners.add(building.playerId);
  }

  const victims: PlayerId[] = [];
  for (const pid of state.playerOrder) {
    if (!adjacentOwners.has(pid)) continue;
    if (resourceCardCount(state, pid) < 1) continue;
    victims.push(pid);
  }
  return victims;
}

export type RobberVictimChoice =
  | { kind: "immediate"; stealFrom: PlayerId | null }
  | { kind: "choose"; victims: PlayerId[] };

export function resolveRobberVictimChoice(
  state: GameState,
  actingPid: PlayerId,
  hid: HexId,
  graph: CatanGraph,
): RobberVictimChoice {
  const victims = getRobbableVictimPids(state, actingPid, hid, graph);
  if (victims.length === 0) return { kind: "immediate", stealFrom: null };
  if (victims.length === 1) return { kind: "immediate", stealFrom: victims[0]! };
  return { kind: "choose", victims };
}
