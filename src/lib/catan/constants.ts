import type {
  HexCoord,
  TerrainType,
  HarborType,
  ProgressCard,
  ProgressCardName,
  ImprovementTrack,
  KnightStrength,
  Resources,
} from "./types.js";

// ─── Standard Beginner Board Layout ───────────────────────────────────────────
// Follows the fixed beginner setup from the Catan base rules.

export interface HexSetup {
  coord: HexCoord;
  terrain: TerrainType;
  number: number | null;
}

export const STANDARD_BOARD: HexSetup[] = [
  // Row r=-2 (top, 3 hexes): mountains-10, pasture-2, forest-9
  { coord: { q: 0, r: -2 }, terrain: "mountains", number: 10 },
  { coord: { q: 1, r: -2 }, terrain: "pasture", number: 2 },
  { coord: { q: 2, r: -2 }, terrain: "forest", number: 9 },
  // Row r=-1 (4 hexes): fields-12, hills-6, pasture-4, hills-10
  { coord: { q: -1, r: -1 }, terrain: "fields", number: 12 },
  { coord: { q: 0, r: -1 }, terrain: "hills", number: 6 },
  { coord: { q: 1, r: -1 }, terrain: "pasture", number: 4 },
  { coord: { q: 2, r: -1 }, terrain: "hills", number: 10 },
  // Row r=0 (5 hexes): fields-9, forest-11, desert, forest-3, mountains-8
  { coord: { q: -2, r: 0 }, terrain: "fields", number: 9 },
  { coord: { q: -1, r: 0 }, terrain: "forest", number: 11 },
  { coord: { q: 0, r: 0 }, terrain: "desert", number: null },
  { coord: { q: 1, r: 0 }, terrain: "forest", number: 3 },
  { coord: { q: 2, r: 0 }, terrain: "mountains", number: 8 },
  // Row r=1 (4 hexes): forest-8, mountains-3, fields-4, pasture-5
  { coord: { q: -2, r: 1 }, terrain: "forest", number: 8 },
  { coord: { q: -1, r: 1 }, terrain: "mountains", number: 3 },
  { coord: { q: 0, r: 1 }, terrain: "fields", number: 4 },
  { coord: { q: 1, r: 1 }, terrain: "pasture", number: 5 },
  // Row r=2 (3 hexes): hills-5, fields-6, pasture-11
  { coord: { q: -2, r: 2 }, terrain: "hills", number: 5 },
  { coord: { q: -1, r: 2 }, terrain: "fields", number: 6 },
  { coord: { q: 0, r: 2 }, terrain: "pasture", number: 11 },
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
// Pointy-top edge → direction mapping:
//   edge 0 = SW face  (between bottom and lower-left vertices)
//   edge 1 = W  face  (between lower-left and upper-left)
//   edge 2 = NW face  (between upper-left and top)
//   edge 3 = NE face  (between top and upper-right)
//   edge 4 = E  face  (between upper-right and lower-right)
//   edge 5 = SE face  (between lower-right and bottom)
// All chosen edges face off-island (sea-facing).
export const HARBOR_SETUPS: HarborSetup[] = [
  // Generic 3:1 harbors (4)
  { type: "generic", hexCoord: { q: 0, r: -2 }, edgeIndex: 2 }, // NW: upper-left corner
  { type: "generic", hexCoord: { q: 2, r: -2 }, edgeIndex: 3 }, // NE: upper-right corner
  { type: "generic", hexCoord: { q: -2, r: 1 }, edgeIndex: 1 }, // W:  left side
  { type: "generic", hexCoord: { q: 0, r: 2 }, edgeIndex: 5 }, // SE: bottom
  // Specific 2:1 harbors (5)
  { type: "ore", hexCoord: { q: 2, r: -1 }, edgeIndex: 4 }, // E:  right upper
  { type: "wool", hexCoord: { q: 2, r: 0 }, edgeIndex: 5 }, // SE: right lower
  { type: "brick", hexCoord: { q: 1, r: 1 }, edgeIndex: 5 }, // SE: lower-right
  { type: "grain", hexCoord: { q: -2, r: 2 }, edgeIndex: 0 }, // SW: bottom-left
  { type: "lumber", hexCoord: { q: -1, r: -1 }, edgeIndex: 2 }, // NW: upper-left
];

// ─── Progress Card Decks ───────────────────────────────────────────────────────

function repeat<T extends object>(val: T, count: number): T[] {
  return Array.from({ length: count }, () => ({ ...val }));
}

function card(
  name: string,
  track: ImprovementTrack,
  isVP = false,
): ProgressCard {
  return { name: name as ProgressCardName, track, isVP };
}

export const SCIENCE_DECK: ProgressCard[] = [
  ...repeat(card("Alchemy", "science"), 2),
  ...repeat(card("Crane", "science"), 2),
  card("Engineering", "science"),
  ...repeat(card("Invention", "science"), 2),
  ...repeat(card("Irrigation", "science"), 2),
  ...repeat(card("Medicine", "science"), 2),
  ...repeat(card("Mining", "science"), 2),
  ...repeat(card("RoadBuilding", "science"), 2),
  ...repeat(card("Smithing", "science"), 2),
  card("Printing", "science", true),
]; // 18 cards

export const TRADE_DECK: ProgressCard[] = [
  ...repeat(card("CommercialHarbor", "trade"), 2),
  ...repeat(card("GuildDues", "trade"), 2),
  ...repeat(card("Merchant", "trade"), 6),
  ...repeat(card("MerchantFleet", "trade"), 2),
  ...repeat(card("ResourceMonopoly", "trade"), 4),
  ...repeat(card("TradeMonopoly", "trade"), 2),
]; // 18 cards

export const POLITICS_DECK: ProgressCard[] = [
  ...repeat(card("Diplomacy", "politics"), 2),
  ...repeat(card("Encouragement", "politics"), 2),
  ...repeat(card("Espionage", "politics"), 3),
  ...repeat(card("Intrigue", "politics"), 2),
  ...repeat(card("Sabotage", "politics"), 2),
  ...repeat(card("Taxation", "politics"), 2),
  ...repeat(card("Treason", "politics"), 2),
  ...repeat(card("Wedding", "politics"), 2),
  card("Constitution", "politics", true),
]; // 18 cards

// ─── City Improvement Costs ────────────────────────────────────────────────────

/** Cost in commodities to advance track from currentLevel to currentLevel+1 */
export function improvementCost(
  _track: ImprovementTrack,
  currentLevel: number,
): number {
  return currentLevel + 1; // level 0→1 costs 1, 1→2 costs 2, ... 4→5 costs 5
}

/** The commodity type required for each track */
export const TRACK_COMMODITY: Record<ImprovementTrack, keyof Resources> = {
  science: "paper",
  trade: "cloth",
  politics: "coin",
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

import type { EventDieFace } from "./types.js";

export const EVENT_DIE_FACES: EventDieFace[] = [
  "ship",
  "ship",
  "ship",
  "science",
  "trade",
  "politics",
];

export function rollEventDie(): EventDieFace {
  return EVENT_DIE_FACES[Math.floor(Math.random() * 6)]!;
}

export const EVENT_COLORS: Record<EventDieFace, string> = {
  ship:     "#7a8fa0",
  science:  "#2e9e4f",
  trade:    "#f1c232",
  politics: "#2f6fe4",
};

export const EVENT_LABELS: Record<EventDieFace, string> = {
  ship:     "Barbarian",
  science:  "Science",
  trade:    "Trade",
  politics: "Politics",
};

export function eventDieIcon(face: EventDieFace): string {
  return face === "ship" ? "⛵" : "🏰";
}

export function eventDieTextColor(face: EventDieFace): string {
  return face === "trade" ? "#2f2400" : "#ffffff";
}

export function rollProductionDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

// ─── Player Colors ─────────────────────────────────────────────────────────────

export const PLAYER_COLORS = ["#e74c3c", "#3498db", "#f39c12", "#2ecc71"];

// ─── Initial Supply ───────────────────────────────────────────────────────────

export const INITIAL_SUPPLY = {
  roads: 15,
  settlements: 4,
  cities: 4,
  cityWalls: 3,
  knights: { 1: 2 as number, 2: 2 as number, 3: 2 as number } as Record<
    1 | 2 | 3,
    number
  >,
};

// ─── UI Hints / Card Metadata ───────────────────────────────────────────────

export interface ProgressCardInfo {
  title: string;
  short: string;
  effect: string;
  requiresTarget: boolean;
}

export const TRACK_BADGE_COLOR: Record<ImprovementTrack, string> = {
  science: "#2e9e4f",
  trade: "#f1c232",
  politics: "#2f6fe4",
};

export const PROGRESS_CARD_INFO: Record<ProgressCardName, ProgressCardInfo> = {
  Alchemy: {
    title: "Alchemy",
    short: "Pick both production dice before you roll.",
    effect:
      "Play at the start of your roll phase, choose both production dice values, then roll the event die normally.",
    requiresTarget: false,
  },
  Crane: {
    title: "Crane",
    short: "Next city improvement costs one less commodity.",
    effect:
      "Use this turn to buy exactly one city improvement with cost reduced by 1 (minimum 0).",
    requiresTarget: false,
  },
  Engineering: {
    title: "Engineering",
    short: "Build one city wall for free.",
    effect:
      "Choose one of your cities without a wall and place a wall at no resource cost.",
    requiresTarget: true,
  },
  Invention: {
    title: "Invention",
    short: "Swap two eligible number tokens.",
    effect: "Swap any two number tokens that are not 2, 6, 8, or 12.",
    requiresTarget: true,
  },
  Irrigation: {
    title: "Irrigation",
    short: "Gain grain from your fields.",
    effect:
      "Gain 2 grain for each fields hex adjacent to any of your buildings.",
    requiresTarget: false,
  },
  Medicine: {
    title: "Medicine",
    short: "Cheaper city upgrade this turn.",
    effect: "Upgrade one of your settlements to a city for 1 grain + 2 ore.",
    requiresTarget: true,
  },
  Mining: {
    title: "Mining",
    short: "Gain ore from your mountains.",
    effect:
      "Gain 2 ore for each mountains hex adjacent to any of your buildings.",
    requiresTarget: false,
  },
  RoadBuilding: {
    title: "Road Building",
    short: "Build two roads for free.",
    effect:
      "Place up to 2 roads at no resource cost, following normal road placement rules.",
    requiresTarget: true,
  },
  Smithing: {
    title: "Smithing",
    short: "Promote up to two knights for free.",
    effect:
      "Choose up to two of your knights and promote each once this turn at no cost.",
    requiresTarget: true,
  },
  Printing: {
    title: "Printing",
    short: "Victory point card.",
    effect: "Place face-up immediately. This card gives 1 victory point.",
    requiresTarget: false,
  },
  CommercialHarbor: {
    title: "Commercial Harbor",
    short: "Offer resource-for-commodity trades to each player.",
    effect:
      "Offer each opponent one resource type from your hand; they must return one commodity or decline if none.",
    requiresTarget: true,
  },
  GuildDues: {
    title: "Guild Dues",
    short: "Take two chosen cards from one eligible player.",
    effect:
      "Pick one player with VP at least as high as yours and take any 2 resource/commodity cards from their hand.",
    requiresTarget: true,
  },
  Merchant: {
    title: "Merchant",
    short: "Place the merchant for ongoing 2:1 trade + 1 VP.",
    effect:
      "Place the merchant on a land hex adjacent to one of your buildings. You gain 1 VP while you hold it and may trade that hex's resource at 2:1.",
    requiresTarget: true,
  },
  MerchantFleet: {
    title: "Merchant Fleet",
    short: "Trade one chosen resource or commodity at 2:1 this turn.",
    effect:
      "Choose one card type; for the rest of this turn, you may trade it at 2:1 with the bank.",
    requiresTarget: true,
  },
  ResourceMonopoly: {
    title: "Resource Monopoly",
    short: "Claim resources from every opponent.",
    effect:
      "Name one resource type; each opponent gives you up to 2 of that resource.",
    requiresTarget: true,
  },
  TradeMonopoly: {
    title: "Trade Monopoly",
    short: "Claim one commodity from every opponent.",
    effect:
      "Name one commodity type; each opponent gives you 1 of that commodity if possible.",
    requiresTarget: true,
  },
  Constitution: {
    title: "Constitution",
    short: "Victory point card.",
    effect: "Place face-up immediately. This card gives 1 victory point.",
    requiresTarget: false,
  },
  Diplomacy: {
    title: "Diplomacy",
    short: "Remove an open road, then maybe place one free road.",
    effect:
      "Choose an open road to remove. If it is your own road, immediately place one free road.",
    requiresTarget: true,
  },
  Encouragement: {
    title: "Encouragement",
    short: "Activate all your knights for free.",
    effect: "All of your knights become active at no grain cost.",
    requiresTarget: false,
  },
  Espionage: {
    title: "Espionage",
    short: "Peek at an opponent's progress hand and optionally steal one.",
    effect:
      "Choose one opponent, view their progress cards, and optionally take one non-VP card.",
    requiresTarget: true,
  },
  Intrigue: {
    title: "Intrigue",
    short: "Displace one eligible enemy knight.",
    effect:
      "Pick an opponent knight connected to one of your routes and force it to relocate/remove, without moving one of your own knights.",
    requiresTarget: true,
  },
  Sabotage: {
    title: "Sabotage",
    short: "High-VP opponents discard half their cards.",
    effect:
      "Each opponent with VP at least as high as yours discards half of their resource+commodity cards (rounded down).",
    requiresTarget: false,
  },
  Taxation: {
    title: "Taxation",
    short: "Move robber and steal from all players on that hex.",
    effect:
      "Move the robber to a new hex and steal one random card from each opponent with a building on that hex.",
    requiresTarget: true,
  },
  Treason: {
    title: "Treason",
    short: "Replace an opponent knight with your own.",
    effect:
      "Choose an opponent knight to remove, then optionally place one of your own equal-or-lower strength knights there.",
    requiresTarget: true,
  },
  Wedding: {
    title: "Wedding",
    short: "Higher-VP opponents give you two cards each.",
    effect:
      "Every opponent with more VP than you gives you 2 resource/commodity cards of their choice.",
    requiresTarget: false,
  },
};

export const PROGRESS_CARD_BY_NAME: Record<ProgressCardName, ProgressCard> = {
  Alchemy: { name: "Alchemy", track: "science", isVP: false },
  Crane: { name: "Crane", track: "science", isVP: false },
  Engineering: { name: "Engineering", track: "science", isVP: false },
  Invention: { name: "Invention", track: "science", isVP: false },
  Irrigation: { name: "Irrigation", track: "science", isVP: false },
  Medicine: { name: "Medicine", track: "science", isVP: false },
  Mining: { name: "Mining", track: "science", isVP: false },
  RoadBuilding: { name: "RoadBuilding", track: "science", isVP: false },
  Smithing: { name: "Smithing", track: "science", isVP: false },
  Printing: { name: "Printing", track: "science", isVP: true },
  CommercialHarbor: {
    name: "CommercialHarbor",
    track: "trade",
    isVP: false,
  },
  GuildDues: { name: "GuildDues", track: "trade", isVP: false },
  Merchant: { name: "Merchant", track: "trade", isVP: false },
  MerchantFleet: { name: "MerchantFleet", track: "trade", isVP: false },
  ResourceMonopoly: {
    name: "ResourceMonopoly",
    track: "trade",
    isVP: false,
  },
  TradeMonopoly: { name: "TradeMonopoly", track: "trade", isVP: false },
  Diplomacy: { name: "Diplomacy", track: "politics", isVP: false },
  Encouragement: { name: "Encouragement", track: "politics", isVP: false },
  Espionage: { name: "Espionage", track: "politics", isVP: false },
  Intrigue: { name: "Intrigue", track: "politics", isVP: false },
  Sabotage: { name: "Sabotage", track: "politics", isVP: false },
  Taxation: { name: "Taxation", track: "politics", isVP: false },
  Treason: { name: "Treason", track: "politics", isVP: false },
  Wedding: { name: "Wedding", track: "politics", isVP: false },
  Constitution: { name: "Constitution", track: "politics", isVP: true },
};

export function getProgressCardByName(name: ProgressCardName): ProgressCard {
  return PROGRESS_CARD_BY_NAME[name];
}

// ─── Build Costs (Canonical Source) ───────────────────────────────────────────

export const BUILD_COSTS = {
  road: { brick: 1, lumber: 1 } as Partial<Resources>,
  settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 } as Partial<Resources>,
  city: { ore: 3, grain: 2 } as Partial<Resources>,
  cityWall: { brick: 2 } as Partial<Resources>, // 2 brick per rulebook
  knightRecruit: { ore: 1, wool: 1 } as Partial<Resources>,
  knightPromote: { ore: 1, wool: 1 } as Partial<Resources>,
  knightActivate: { grain: 1 } as Partial<Resources>,
};

/** UI hints derived from canonical BUILD_COSTS */
export const BUILD_COST_HINTS: Array<{
  label: string;
  cost: Partial<Resources>;
}> = [
  { label: "Road", cost: BUILD_COSTS.road },
  { label: "Settlement", cost: BUILD_COSTS.settlement },
  { label: "City", cost: BUILD_COSTS.city },
  { label: "City Wall", cost: BUILD_COSTS.cityWall },
  { label: "Recruit Knight", cost: BUILD_COSTS.knightRecruit },
  { label: "Promote Knight", cost: BUILD_COSTS.knightPromote },
  { label: "Activate Knight", cost: BUILD_COSTS.knightActivate },
];

export const KNIGHT_LEVEL_HINTS: Record<
  KnightStrength,
  { name: string; text: string }
> = {
  1: {
    name: "Basic Knight",
    text: "Strength 1. Recruit with ore+wool. Can move/displace weaker active targets after activation.",
  },
  2: {
    name: "Strong Knight",
    text: "Strength 2. Promote from basic using ore+wool.",
  },
  3: {
    name: "Mighty Knight",
    text: "Strength 3. Requires politics level 3 before promotion from strong.",
  },
};
