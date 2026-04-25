// ─── Coordinates ──────────────────────────────────────────────────────────────

export interface HexCoord {
  q: number;
  r: number;
}

/** "q,r" */
export type HexId = string;

/**
 * Canonical vertex ID: "q,r:v" where (q,r) is the lexicographically smallest
 * hex that touches this vertex and v ∈ {0..5} is the local vertex index on
 * that hex (flat-top, 0 = top-right, clockwise).
 */
export type VertexId = string;

/**
 * Canonical edge ID: "q,r:e" where (q,r) is the lexicographically smallest
 * hex that touches this edge and e ∈ {0..5} is the local edge index (flat-top,
 * 0 = right edge, clockwise).
 */
export type EdgeId = string;

export type PlayerId = string;

// ─── Board Terrain & Resources ────────────────────────────────────────────────

export type TerrainType =
  | "hills"
  | "forest"
  | "mountains"
  | "fields"
  | "pasture"
  | "desert";

export type ResourceType = "brick" | "lumber" | "ore" | "grain" | "wool";
export type CommodityType = "cloth" | "coin" | "paper";
export type CardType = ResourceType | CommodityType;

export type ImprovementTrack = "science" | "trade" | "politics";

/** All resource + commodity amounts for a player */
export interface Resources {
  brick: number;
  lumber: number;
  ore: number;
  grain: number;
  wool: number;
  cloth: number;
  coin: number;
  paper: number;
}

export function emptyResources(): Resources {
  return {
    brick: 0,
    lumber: 0,
    ore: 0,
    grain: 0,
    wool: 0,
    cloth: 0,
    coin: 0,
    paper: 0,
  };
}

export function totalCards(r: Resources): number {
  return (
    r.brick + r.lumber + r.ore + r.grain + r.wool + r.cloth + r.coin + r.paper
  );
}

export function totalResourceCards(r: Resources): number {
  return r.brick + r.lumber + r.ore + r.grain + r.wool;
}

// ─── Board Entities ────────────────────────────────────────────────────────────

export interface Hex {
  id: HexId;
  coord: HexCoord;
  terrain: TerrainType;
  /** null for desert */
  number: number | null;
  hasRobber: boolean;
}

export type HarborType = "generic" | ResourceType;

export interface Harbor {
  type: HarborType;
  /** The two coastal vertices that grant this harbor */
  vertices: [VertexId, VertexId];
}

// ─── Buildings & Pieces ───────────────────────────────────────────────────────

export interface Settlement {
  type: "settlement";
  playerId: PlayerId;
}

export interface City {
  type: "city";
  playerId: PlayerId;
  hasWall: boolean;
  /** Which metropolis track is placed here, if any */
  metropolis: ImprovementTrack | null;
}

export type Building = Settlement | City;

export type KnightStrength = 1 | 2 | 3;

export interface Knight {
  playerId: PlayerId;
  strength: KnightStrength;
  active: boolean;
}

export interface Road {
  playerId: PlayerId;
}

// ─── Progress Cards ───────────────────────────────────────────────────────────

export type ScienceCardName =
  | "Alchemy"
  | "Crane"
  | "Engineering"
  | "Invention"
  | "Irrigation"
  | "Medicine"
  | "Mining"
  | "RoadBuilding"
  | "Smithing"
  | "Printing";

export type TradeCardName =
  | "CommercialHarbor"
  | "GuildDues"
  | "Merchant"
  | "MerchantFleet"
  | "ResourceMonopoly"
  | "TradeMonopoly";

export type PoliticsCardName =
  | "Diplomacy"
  | "Encouragement"
  | "Espionage"
  | "Intrigue"
  | "Sabotage"
  | "Taxation"
  | "Treason"
  | "Wedding"
  | "Constitution";

export type ProgressCardName =
  | ScienceCardName
  | TradeCardName
  | PoliticsCardName;

export interface ProgressCard {
  name: ProgressCardName;
  track: ImprovementTrack;
  isVP: boolean;
}

// ─── Player ───────────────────────────────────────────────────────────────────

export interface PlayerImprovements {
  science: number; // 0–5
  trade: number;
  politics: number;
}

export interface PlayerSupply {
  /** Roads remaining in supply */
  roads: number;
  /** Settlements remaining in supply */
  settlements: number;
  /** Cities remaining in supply (includes cities on board) */
  cities: number;
  /** City walls remaining in supply */
  cityWalls: number;
  /** Knights remaining in supply by strength level */
  knights: { 1: number; 2: number; 3: number };
}

export interface Player {
  id: PlayerId;
  name: string;
  color: string;
  isBot: boolean;
  resources: Resources;
  /** Progress cards in hand (max 4; VP cards face-up don't count) */
  progressCards: ProgressCard[];
  /** VP tokens earned from defending against barbarians */
  vpTokens: number;
  improvements: PlayerImprovements;
  supply: PlayerSupply;
}

// ─── Board State ──────────────────────────────────────────────────────────────

export interface BoardState {
  hexes: Record<HexId, Hex>;
  vertices: Record<VertexId, Building | null>;
  edges: Record<EdgeId, Road | null>;
  knights: Record<VertexId, Knight | null>;
  harbors: Harbor[];
  /** Which hex the merchant is on (null = not placed) */
  merchantHex: HexId | null;
  merchantOwner: PlayerId | null;
}

// ─── Barbarian Track ──────────────────────────────────────────────────────────

export interface BarbarianTrack {
  /** 0 = start, 7 = attack */
  position: number;
  /** false until first barbarian attack resolves */
  robberActive: boolean;
}

// ─── Game State ───────────────────────────────────────────────────────────────

export type EventDieFace = "ship" | "science" | "trade" | "politics";

export type TurnPhase =
  | "SETUP_R1_SETTLEMENT" // place settlement
  | "SETUP_R1_ROAD" // place road after settlement
  | "SETUP_R2_CITY" // place city (C&K: round 2 places a city)
  | "SETUP_R2_ROAD" // place road after city
  | "ROLL_DICE" // may play Alchemy before rolling
  | "RESOLVE_BARBARIANS" // host-driven barbarian attack resolution
  | "RESOLVE_PROGRESS_DRAW" // players draw from progress decks
  | "PRODUCTION" // collect resources / handle 7-roll discards
  | "DISCARD" // sub-phase: specific players must discard
  | "DISCARD_PROGRESS" // sub-phase: discard down to 4 non-VP progress cards
  | "ROBBER_MOVE" // current player places robber
  | "ACTION" // trade / build / knight actions
  | "KNIGHT_DISPLACE_RESPONSE" // displaced player must move their knight
  | "SCIENCE_SELECT_RESOURCE" // active player claims 1 free resource (science L3)
  | "GAME_OVER";

export interface PendingDisplace {
  displacerPlayerId: PlayerId;
  displacedPlayerId: PlayerId;
  displacedKnightVertex: VertexId;
  displacedKnightStrength: KnightStrength;
}

export interface PendingProgressDraw {
  /** Players still needing to draw, in order */
  remaining: PlayerId[];
  track: ImprovementTrack;
}

export interface PendingDiscard {
  /** Players still needing to discard, keyed by playerId, value = amount to discard */
  remaining: Record<PlayerId, number>;
}

/** After drawing progress cards, players with more than 4 non-VP cards must discard down */
export interface PendingProgressDiscard {
  remaining: Record<PlayerId, number>;
}

/** Production from the current roll is applied after progress discards finish (e.g. barbarian tie draws) */
export interface PendingRollResume {
  rollerPid: PlayerId;
  production: number;
}

export interface PendingFreeRoads {
  pid: PlayerId;
  remaining: 1 | 2;
}

export interface PendingKnightPromotions {
  pid: PlayerId;
  remaining: 1 | 2;
}

export interface PendingTreason {
  /** Player who played Treason and must now optionally place their own knight */
  pid: PlayerId;
  /** The removed knight's strength — limits the strength the placer can use */
  maxStrength: KnightStrength;
  /** The removed knight's active status — the placed knight inherits this */
  active: boolean;
}

export interface PendingCommercialHarbor {
  initiatorPid: PlayerId;
  offeredResource: ResourceType;
  /** Opponents who still need to respond */
  remainingPids: PlayerId[];
}

export interface PendingVpCardAnnouncement {
  pid: PlayerId;
  card: ProgressCard;
}

export interface PendingScienceBonus {
  /** The player who must select their free resource */
  pid: PlayerId;
}

export interface PendingTradeOffer {
  initiatorPid: PlayerId;
  /** Players who have not yet responded; offer stays live until empty or someone accepts */
  targetPids: PlayerId[];
  /** Resources the initiator gives to the accepting player */
  offer: Partial<Resources>;
  /** Resources the initiator wants from the accepting player */
  want: Partial<Resources>;
}

/**
 * Deterministic snapshot of a barbarian attack outcome.
 * Populated when the ship reaches the island; drives the client-side cinematic.
 * The actual state mutation (VP, pillage, knight deactivation, robber) is deferred
 * to EXECUTE_BARBARIAN_ATTACK so the UI can animate the reveal.
 */
export interface PendingBarbarian {
  /** Total barbarian strength = # cities on the board (including metropolises) */
  barbarianStrength: number;
  /** Sum of all active knight strengths */
  totalDefense: number;
  /** Contribution per player (active knight strength total) */
  defensePerPlayer: Record<PlayerId, number>;
  /** Outcome: defenders win outright, tied top defenders draw cards, or barbarians pillage */
  outcome: "defenders_win" | "tie_draw" | "barbarians_win";
  /** Single hero who earns a VP token (defenders_win with one top defender), else [] */
  vpWinners: PlayerId[];
  /** Tied top defenders who each draw a progress card (tie_draw), else [] */
  tiedDefenders: PlayerId[];
  /** Cities that will be pillaged (barbarians_win), in reveal order */
  citiesPillaged: VertexId[];
}

export type PendingStateField =
  | "pendingDisplace"
  | "pendingProgressDraw"
  | "pendingDiscard"
  | "pendingProgressDiscard"
  | "pendingRollResume"
  | "pendingFreeRoads"
  | "pendingKnightPromotions"
  | "pendingCommercialHarbor"
  | "pendingTreason"
  | "pendingVpCardAnnouncement"
  | "pendingScienceBonus"
  | "pendingTradeOffer"
  | "pendingBarbarian";

export interface ProgressEffects {
  craneDiscountPlayerId: PlayerId | null;
  merchantFleet: {
    playerId: PlayerId;
    cardType: keyof Resources;
  } | null;
}

export interface GameState {
  /** Incremented on every mutation — helps detect stale renders */
  version: number;
  phase: TurnPhase;
  currentPlayerId: PlayerId;
  playerOrder: PlayerId[];
  players: Record<PlayerId, Player>;
  board: BoardState;
  barbarian: BarbarianTrack;
  decks: {
    science: ProgressCard[];
    trade: ProgressCard[];
    politics: ProgressCard[];
  };
  longestRoadOwner: PlayerId | null;
  longestRoadLength: number;
  /** Who permanently owns each metropolis (level 5) or temporarily (level 4) */
  metropolisOwner: Record<ImprovementTrack, PlayerId | null>;
  /** Last dice roll: [die1, die2, eventDie] */
  lastRoll: [number, number, EventDieFace] | null;
  /** Player who made the last dice roll */
  lastRollPid: PlayerId | null;
  /** Setup: remaining players in current setup round order */
  setupQueue: PlayerId[];
  /** Setup: vertex where current player just placed their building (restricts road placement to adjacent edges) */
  setupLastPlacedVertex: VertexId | null;
  pendingDisplace: PendingDisplace | null;
  pendingProgressDraw: PendingProgressDraw | null;
  pendingDiscard: PendingDiscard | null;
  pendingProgressDiscard: PendingProgressDiscard | null;
  /** When set, `production` from this roller’s dice has not yet been resolved */
  pendingRollResume: PendingRollResume | null;
  pendingFreeRoads: PendingFreeRoads | null;
  pendingKnightPromotions: PendingKnightPromotions | null;
  pendingCommercialHarbor: PendingCommercialHarbor | null;
  pendingTreason: PendingTreason | null;
  pendingVpCardAnnouncement: PendingVpCardAnnouncement | null;
  /** Populated while phase === "RESOLVE_BARBARIANS"; drives the attack cinematic */
  pendingBarbarian: PendingBarbarian | null;
  /** Science level 3: active player must choose a free resource (non-7 zero-production roll) */
  pendingScienceBonus: PendingScienceBonus | null;
  /** Active player-to-player trade offer waiting for the target to accept or reject */
  pendingTradeOffer: PendingTradeOffer | null;
  /** Knights activated during the current player's turn cannot take knight actions until next turn. */
  knightsActivatedThisTurn: VertexId[];
  progressEffects: ProgressEffects;
  winner: PlayerId | null;
  /** Game log entries */
  log: string[];
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type GameAction =
  // Setup
  | {
      type: "PLACE_BUILDING";
      pid: PlayerId;
      vid: VertexId;
      building: "settlement" | "city";
    }
  | { type: "PLACE_ROAD"; pid: PlayerId; eid: EdgeId }
  // Roll
  | {
      type: "ROLL_DICE";
      pid: PlayerId;
      result?: [number, number, EventDieFace];
    }
  // Production / 7 handling
  | { type: "DISCARD"; pid: PlayerId; cards: Partial<Resources> }
  | { type: "DISCARD_PROGRESS"; pid: PlayerId; cards: ProgressCard[] }
  | {
      type: "MOVE_ROBBER";
      pid: PlayerId;
      hid: HexId;
      stealFrom: PlayerId | null;
    }
  // Building
  | { type: "BUILD_ROAD"; pid: PlayerId; eid: EdgeId }
  | { type: "BUILD_SETTLEMENT"; pid: PlayerId; vid: VertexId }
  | { type: "BUILD_CITY"; pid: PlayerId; vid: VertexId }
  | { type: "BUILD_CITY_WALL"; pid: PlayerId; vid: VertexId }
  | { type: "IMPROVE_CITY"; pid: PlayerId; track: ImprovementTrack }
  // Knights
  | { type: "RECRUIT_KNIGHT"; pid: PlayerId; vid: VertexId }
  | { type: "PROMOTE_KNIGHT"; pid: PlayerId; vid: VertexId }
  | { type: "ACTIVATE_KNIGHT"; pid: PlayerId; vid: VertexId }
  | { type: "MOVE_KNIGHT"; pid: PlayerId; from: VertexId; to: VertexId }
  | { type: "DISPLACE_KNIGHT"; pid: PlayerId; from: VertexId; target: VertexId }
  | {
      type: "DISPLACED_MOVE";
      pid: PlayerId;
      from: VertexId;
      to: VertexId | null;
    }
  | {
      type: "CHASE_ROBBER";
      pid: PlayerId;
      knight: VertexId;
      hid: HexId;
      stealFrom: PlayerId | null;
    }
  // Progress cards
  | {
      type: "PLAY_PROGRESS";
      pid: PlayerId;
      card: ProgressCardName;
      params?: unknown;
    }
  | { type: "DRAW_PROGRESS"; pid: PlayerId; track: ImprovementTrack }
  // Progress card multi-step actions (PROGRESS_ prefix)
  | { type: "PROGRESS_PLACE_FREE_ROAD"; pid: PlayerId; eid: EdgeId }
  | { type: "PROGRESS_SKIP_FREE_ROADS"; pid: PlayerId }
  | { type: "PROGRESS_PROMOTE_FREE_KNIGHT"; pid: PlayerId; vid: VertexId }
  | { type: "PROGRESS_SKIP_FREE_PROMOTIONS"; pid: PlayerId }
  | { type: "PROGRESS_PLACE_TREASON_KNIGHT"; pid: PlayerId; vid: VertexId; strength: KnightStrength }
  | { type: "PROGRESS_SKIP_TREASON"; pid: PlayerId }
  | { type: "ACKNOWLEDGE_VP_CARD"; pid: PlayerId }
  | {
      type: "PROGRESS_RESPOND_COMMERCIAL_HARBOR";
      pid: PlayerId;
      commodity?: CommodityType;
    }
  // Science level 3 no-production bonus
  | {
      type: "SELECT_SCIENCE_RESOURCE";
      pid: PlayerId;
      resource: keyof Resources;
    }
  // Trading
  | {
      type: "TRADE_BANK";
      pid: PlayerId;
      give: Partial<Resources>;
      get: Partial<Resources>;
    }
  | {
      type: "TRADE_OFFER";
      from: PlayerId;
      to: PlayerId[];
      offer: Partial<Resources>;
      want: Partial<Resources>;
    }
  | { type: "TRADE_ACCEPT"; from: PlayerId; to: PlayerId }
  | { type: "TRADE_REJECT"; from: PlayerId; to: PlayerId }
  | { type: "TRADE_CANCEL"; from: PlayerId; to: PlayerId }
  // Turn
  | { type: "END_TURN"; pid: PlayerId }
  // Barbarian attack commit (host-driven after cinematic plays out)
  | { type: "EXECUTE_BARBARIAN_ATTACK"; pid: PlayerId }
  // Host-only master controls
  | {
      type: "ADMIN_MOVE_ROAD";
      pid: PlayerId;
      fromEid: EdgeId;
      toEid: EdgeId;
      unsafe?: boolean;
      reason?: string;
    }
  | {
      type: "ADMIN_MOVE_BUILDING";
      pid: PlayerId;
      fromVid: VertexId;
      toVid: VertexId;
      unsafe?: boolean;
      reason?: string;
    }
  | {
      type: "ADMIN_MOVE_KNIGHT";
      pid: PlayerId;
      fromVid: VertexId;
      toVid: VertexId;
      unsafe?: boolean;
      reason?: string;
    }
  | {
      type: "ADMIN_SWAP_NUMBER_TOKENS";
      hidA: HexId;
      hidB: HexId;
      reason?: string;
    }
  | {
      type: "ADMIN_SWAP_HEXES";
      hidA: HexId;
      hidB: HexId;
      reason?: string;
    }
  | {
      type: "ADMIN_GRANT_PROGRESS_CARD";
      pid: PlayerId;
      track: ImprovementTrack;
      cardName?: ProgressCardName;
      reason?: string;
    }
  | {
      type: "ADMIN_GRANT_CARDS";
      pid: PlayerId;
      cards: Partial<Resources>;
      reason?: string;
    }
  | {
      type: "ADMIN_SET_PLAYER_BOT";
      pid: PlayerId;
      isBot: boolean;
      reason?: string;
    }
  | {
      type: "ADMIN_CLEAR_PENDING_STATE";
      fields: PendingStateField[];
      phase?: TurnPhase;
      reason?: string;
    }
  | {
      type: "ADMIN_SET_BARBARIAN_PROGRESS";
      position: number;
      reason?: string;
    }
  | {
      type: "ADMIN_END_GAME";
      winner: PlayerId | null;
      reason?: string;
    }
  | {
      type: "ADMIN_UNDO_LAST";
      reason?: string;
    };

export function isAdminAction(action: GameAction): boolean {
  return action.type.startsWith("ADMIN_");
}
