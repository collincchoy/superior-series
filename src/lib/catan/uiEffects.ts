import { buildGraph } from "./board.js";
import type {
  GameState,
  PlayerId,
  Resources,
  TerrainType,
  HexId,
  ProgressCard,
} from "./types.js";
import { RESOURCE_KEYS } from "./types.js";

export type CardDeltaKind = keyof Resources | "progress";

export interface CardDeltaToken {
  kind: CardDeltaKind;
  amount: number;
}

export interface PlayerCardDeltaEvent {
  pid: PlayerId;
  tokens: CardDeltaToken[];
}

const graph = buildGraph();

export function computePlayerCardDeltaEvents(
  prev: GameState,
  next: GameState,
): PlayerCardDeltaEvent[] {
  const events: PlayerCardDeltaEvent[] = [];

  for (const pid of next.playerOrder) {
    const prevPlayer = prev.players[pid];
    const nextPlayer = next.players[pid];
    if (!prevPlayer || !nextPlayer) continue;

    const tokens: CardDeltaToken[] = [];

    for (const key of RESOURCE_KEYS) {
      const delta =
        (nextPlayer.resources[key] ?? 0) - (prevPlayer.resources[key] ?? 0);
      if (delta !== 0) {
        tokens.push({ kind: key, amount: delta });
      }
    }

    const progressDelta = computeProgressHandDelta(
      prevPlayer.progressCards,
      nextPlayer.progressCards,
    );
    if (progressDelta !== 0) {
      tokens.push({ kind: "progress", amount: progressDelta });
    }

    if (tokens.length > 0) {
      events.push({ pid, tokens });
    }
  }

  return events;
}

function computeProgressHandDelta(
  prev: ProgressCard[],
  next: ProgressCard[],
): number {
  return next.length - prev.length;
}

export function getTerrainGlowHexesForPlayer(
  state: GameState,
  pid: PlayerId,
  terrain: TerrainType,
): HexId[] {
  const hexIds: HexId[] = [];

  for (const [hid, hex] of Object.entries(state.board.hexes)) {
    if (hex.terrain !== terrain) continue;

    const vertices = graph.verticesOfHex[hid] ?? [];
    const touchesPlayerBuilding = vertices.some(
      (vid) => state.board.vertices[vid]?.playerId === pid,
    );

    if (touchesPlayerBuilding) {
      hexIds.push(hid);
    }
  }

  return hexIds;
}

export function getProducingHexIds(
  state: GameState,
  production: number,
): HexId[] {
  return Object.entries(state.board.hexes)
    .filter(([, hex]) => {
      if (hex.number !== production) return false;
      if (hex.hasRobber) return false;
      if (hex.terrain === "desert") return false;
      return true;
    })
    .map(([hid]) => hid);
}
