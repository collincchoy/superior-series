import type {
  HexCoord,
  TerrainType,
  HarborType,
  VertexId,
  ProgressCard,
  ImprovementTrack,
  Resources,
} from './types.js';
import { CATAN_HEX_COORDS, buildGraph, hexId } from './board.js';

// ─── Standard Beginner Board Layout ───────────────────────────────────────────
// Follows the fixed beginner setup from the Catan base rules.

export interface HexSetup {
  coord: HexCoord;
  terrain: TerrainType;
  number: number | null;
}

export const STANDARD_BOARD: HexSetup[] = [
  // Row r=-2 (top, 3 hexes): mountains-10, pasture-2, forest-9
  { coord: { q: 0, r: -2 }, terrain: 'mountains', number: 10 },
  { coord: { q: 1, r: -2 }, terrain: 'pasture',   number: 2  },
  { coord: { q: 2, r: -2 }, terrain: 'forest',    number: 9  },
  // Row r=-1 (4 hexes): fields-12, hills-6, pasture-4, hills-10
  { coord: { q: -1, r: -1 }, terrain: 'fields',   number: 12 },
  { coord: { q: 0,  r: -1 }, terrain: 'hills',    number: 6  },
  { coord: { q: 1,  r: -1 }, terrain: 'pasture',  number: 4  },
  { coord: { q: 2,  r: -1 }, terrain: 'hills',    number: 10 },
  // Row r=0 (5 hexes): fields-9, forest-11, desert, forest-3, mountains-8
  { coord: { q: -2, r: 0 }, terrain: 'fields',    number: 9  },
  { coord: { q: -1, r: 0 }, terrain: 'forest',    number: 11 },
  { coord: { q: 0,  r: 0 }, terrain: 'desert',    number: null },
  { coord: { q: 1,  r: 0 }, terrain: 'forest',    number: 3  },
  { coord: { q: 2,  r: 0 }, terrain: 'mountains', number: 8  },
  // Row r=1 (4 hexes): forest-8, mountains-3, fields-4, pasture-5
  { coord: { q: -2, r: 1 }, terrain: 'forest',    number: 8  },
  { coord: { q: -1, r: 1 }, terrain: 'mountains', number: 3  },
  { coord: { q: 0,  r: 1 }, terrain: 'fields',    number: 4  },
  { coord: { q: 1,  r: 1 }, terrain: 'pasture',   number: 5  },
  // Row r=2 (3 hexes): hills-5, fields-6, pasture-11
  { coord: { q: -2, r: 2 }, terrain: 'hills',     number: 5  },
  { coord: { q: -1, r: 2 }, terrain: 'fields',    number: 6  },
  { coord: { q: 0,  r: 2 }, terrain: 'pasture',   number: 11 },
];

// ─── Harbor Positions ──────────────────────────────────────────────────────────
// Each harbor has a type and the two coastal vertex IDs it occupies.
// Vertices are computed after the graph is built.

export interface HarborSetup {
  type: HarborType;
  hexCoord: HexCoord;
  /** Local edge index on that hex that faces the sea */
  edgeIndex: number;
}

/**
 * The 9 harbors defined by the hex they're adjacent to and which edge faces sea.
 * In the beginner layout these are at fixed positions.
 */
export const HARBOR_SETUPS: HarborSetup[] = [
  // Generic 3:1 harbors (4)
  { type: 'generic',    hexCoord: { q: 0,  r: -2 }, edgeIndex: 1 }, // NE of top-left hex
  { type: 'generic',    hexCoord: { q: 2,  r: -2 }, edgeIndex: 0 }, // E of top-right
  { type: 'generic',    hexCoord: { q: -2, r: 1  }, edgeIndex: 3 }, // W of left middle
  { type: 'generic',    hexCoord: { q: 0,  r: 2  }, edgeIndex: 5 }, // SE bottom
  // Specific 2:1 harbors (5)
  { type: 'ore',        hexCoord: { q: 2,  r: -1 }, edgeIndex: 0 }, // E right side
  { type: 'wool',       hexCoord: { q: 2,  r: 0  }, edgeIndex: 5 }, // SE right
  { type: 'brick',      hexCoord: { q: 1,  r: 1  }, edgeIndex: 4 }, // SW bottom-right
  { type: 'grain',      hexCoord: { q: -2, r: 2  }, edgeIndex: 4 }, // SW bottom-left
  { type: 'lumber',     hexCoord: { q: -1, r: -1 }, edgeIndex: 2 }, // NW top-left
];

// ─── Progress Card Decks ───────────────────────────────────────────────────────

function repeat<T>(val: T, count: number): T[] {
  return Array.from({ length: count }, () => ({ ...val as any }));
}

function card(name: string, track: ImprovementTrack, isVP = false): ProgressCard {
  return { name: name as any, track, isVP };
}

export const SCIENCE_DECK: ProgressCard[] = [
  ...repeat(card('Alchemy', 'science'),     2),
  ...repeat(card('Crane', 'science'),       2),
  card('Engineering', 'science'),
  ...repeat(card('Invention', 'science'),   2),
  ...repeat(card('Irrigation', 'science'),  2),
  ...repeat(card('Medicine', 'science'),    2),
  ...repeat(card('Mining', 'science'),      2),
  ...repeat(card('RoadBuilding', 'science'),2),
  ...repeat(card('Smithing', 'science'),    2),
  card('Printing', 'science', true),
]; // 18 cards

export const TRADE_DECK: ProgressCard[] = [
  ...repeat(card('CommercialHarbor', 'trade'), 2),
  ...repeat(card('GuildDues', 'trade'),        2),
  ...repeat(card('Merchant', 'trade'),         6),
  ...repeat(card('MerchantFleet', 'trade'),    2),
  ...repeat(card('ResourceMonopoly', 'trade'), 4),
  card('Constitution', 'trade', true),
  ...repeat(card('TradeMonopoly', 'trade'),    1),
]; // 18 cards

export const POLITICS_DECK: ProgressCard[] = [
  ...repeat(card('Diplomacy', 'politics'),    2),
  ...repeat(card('Encouragement', 'politics'),2),
  ...repeat(card('Espionage', 'politics'),    3),
  ...repeat(card('Intrigue', 'politics'),     2),
  ...repeat(card('Sabotage', 'politics'),     2),
  ...repeat(card('Taxation', 'politics'),     2),
  ...repeat(card('Treason', 'politics'),      2),
  ...repeat(card('Wedding', 'politics'),      2),
  card('Wedding', 'politics'), // 18th card — verify against rules
]; // 18 cards

// ─── City Improvement Costs ────────────────────────────────────────────────────

/** Cost in commodities to advance track from currentLevel to currentLevel+1 */
export function improvementCost(track: ImprovementTrack, currentLevel: number): number {
  return currentLevel + 1; // level 0→1 costs 1, 1→2 costs 2, ... 4→5 costs 5
}

/** The commodity type required for each track */
export const TRACK_COMMODITY: Record<ImprovementTrack, keyof Resources> = {
  science: 'paper',
  trade:   'cloth',
  politics: 'coin',
};

// ─── Progress Card Draw Ranges ─────────────────────────────────────────────────
// When event die shows a color, each player draws from that deck if the red
// die value falls within [1, drawMax[level]].

export const DRAW_MAX: Record<number, number> = {
  0: 0, // level 0 = no draw
  1: 1, // level 1 draws on red die 1
  2: 3, // level 2 draws on red die 1, 2, or 3
  3: 4, // level 3 draws on 1–4
  4: 5, // level 4 draws on 1–5
  5: 6, // level 5 always draws
};

// ─── Event Die Faces ───────────────────────────────────────────────────────────
// The C&K event die has 6 faces: 3× ship, 1× science, 1× trade, 1× politics
// We simulate it by random index 0–5.

import type { EventDieFace } from './types.js';

export const EVENT_DIE_FACES: EventDieFace[] = [
  'ship', 'ship', 'ship', 'science', 'trade', 'politics',
];

export function rollEventDie(): EventDieFace {
  return EVENT_DIE_FACES[Math.floor(Math.random() * 6)]!;
}

export function rollProductionDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

// ─── Player Colors ─────────────────────────────────────────────────────────────

export const PLAYER_COLORS = ['#e74c3c', '#3498db', '#f39c12', '#2ecc71'];

// ─── Initial Supply ───────────────────────────────────────────────────────────

export const INITIAL_SUPPLY = {
  roads: 15,
  settlements: 4,
  cities: 4,
  cityWalls: 3,
  knights: { 1: 2 as number, 2: 2 as number, 3: 2 as number } as Record<1|2|3, number>,
};
