/**
 * store.svelte.ts — Shared reactive singleton for all Catan UI state.
 * Uses Svelte 5 $state in a class (Svelte 5 requires property mutation,
 * not rebinding, for exported reactive state).
 *
 * IMPORTANT: `net` is a plain property, NOT $state — PeerJS objects must not
 * be proxied (circular refs + internal event emitters break P2P).
 */

import type {
  GameState,
  GameAction,
  PlayerId,
  ProgressCard,
  HexId,
  TerrainType,
  ImprovementTrack,
  TurnPhase,
} from "./types.js";
import { createInitialState } from "./game.js";
import type { BoardPreset } from "./game.js";
import { CatanNetwork, isJoinFailureError } from "./network.js";
import type { JoinDiagnosticEvent, JoinFailure } from "./network.js";
import { PLAYER_COLORS } from "./constants.js";
import { loadCatanProfile, saveBoardPreset } from "./profile.js";
import type { PendingAction, PendingAdminAction } from "./validTargets.js";
import {
  computePlayerCardDeltaEvents,
  getProducingHexIds,
  getTerrainGlowHexesForPlayer,
  type CardDeltaToken,
} from "./uiEffects.js";

export interface PlayerCardDeltaToast {
  id: number;
  pid: PlayerId;
  tokens: CardDeltaToken[];
  expiresAt: number;
}

export interface HexGlowEvent {
  id: number;
  hexIds: HexId[];
  expiresAt: number;
}

export interface LobbyConnectionEvent {
  id: number;
  at: number;
  name: string;
  status: "pending" | "disconnected";
  detail: string;
}

/** Join diagnostic row with a stable list key for the start screen. */
type TrackedJoinDiagnostic = JoinDiagnosticEvent & { id: number };

export type Screen = "start" | "lobby" | "game";
export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type InfoModalState =
  | {
      kind: "progress";
      card: ProgressCard;
      canPlayNow: boolean;
      helperText: string;
    }
  | {
      kind: "card-info";
      card: ProgressCard;
    }
  | {
      kind: "build-costs";
    }
  | {
      kind: "knight-levels";
    }
  | {
      kind: "city-improvement-ability";
      track: ImprovementTrack;
    };

class CatanStore {
  // ── Screens & game ────────────────────────────────────────────────────────
  screen = $state<Screen>("start");
  joiningName = $state("");
  gameState = $state<GameState | null>(null);
  localPid = $state<PlayerId | null>(null);
  pendingAction = $state<PendingAction | null>(null);
  pendingAdminAction = $state<PendingAdminAction | null>(null);

  // ── Lobby / waiting room ──────────────────────────────────────────────────
  roomCode = $state<string | null>(null);
  hostName = $state("Player 1");
  pendingHumans = $state<string[]>([]);
  bots = $state<Array<{ name: string }>>([]);
  boardPreset = $state<BoardPreset>(loadCatanProfile().boardPreset);
  lobbyStatus = $state("");
  lobbyStatusKind = $state<"info" | "error">("info");

  // ── Network diagnostics ───────────────────────────────────────────────────
  connectionStatus = $state<ConnectionStatus>("idle");
  connectionStatusDetail = $state("");
  lastStateUpdateAt = $state<number | null>(null);
  lastStateVersion = $state<number | null>(null);
  playerConnectionStatus = $state<
    Partial<Record<PlayerId, "connected" | "disconnected">>
  >({});
  connectionEvents = $state<TrackedJoinDiagnostic[]>([]);
  lastJoinFailure = $state<JoinFailure | null>(null);
  lobbyConnectionEvents = $state<LobbyConnectionEvent[]>([]);

  // ── Toast ─────────────────────────────────────────────────────────────────
  toast = $state<{ msg: string; kind: "info" | "error" } | null>(null);
  infoModal = $state<InfoModalState | null>(null);
  masterControlOpen = $state(false);
  cardDeltaToasts = $state<PlayerCardDeltaToast[]>([]);
  hexGlowEvents = $state<HexGlowEvent[]>([]);
  /** Phase from the PREVIOUS state update — used by the barbarian cinematic
   *  to detect late-joiners who missed the ROLL_DICE→RESOLVE_BARBARIANS edge. */
  prevPhase = $state<TurnPhase | null>(null);

  // ── Non-reactive (must not be proxied) ────────────────────────────────────
  net: CatanNetwork | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private lastConnectionToastStatus: ConnectionStatus = "idle";
  private visualEventSeq = 1;
  private lobbyConnectionEventSeq = 1;
  private connectionDiagnosticSeq = 1;

  // ── Actions ───────────────────────────────────────────────────────────────

  setLobbyStatus(msg: string, kind: "info" | "error" = "info") {
    this.lobbyStatus = msg;
    this.lobbyStatusKind = kind;
  }

  setConnectionStatus(
    status: ConnectionStatus,
    detail?: string,
    toastOnChange = false,
  ) {
    const previous = this.connectionStatus;
    this.connectionStatus = status;
    this.connectionStatusDetail = detail ?? "";

    if (
      !toastOnChange ||
      previous === status ||
      this.lastConnectionToastStatus === status
    )
      return;

    this.lastConnectionToastStatus = status;
    if (status === "disconnected") {
      this.showToast(detail || "Connection lost", "error");
    } else if (status === "reconnecting") {
      this.showToast(detail || "Reconnecting…", "info");
    } else if (status === "connected") {
      this.showToast(detail || "Reconnected", "info");
    }
  }

  showToast(msg: string, kind: "info" | "error" = "info") {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = { msg, kind };
    this.toastTimer = setTimeout(() => {
      this.toast = null;
    }, 3000);
  }

  openInfoModal(state: InfoModalState) {
    this.infoModal = state;
  }

  closeInfoModal() {
    this.infoModal = null;
  }

  get isHostPlayer(): boolean {
    return this.net?.hostAuthority ?? false;
  }

  setMasterControlOpen(open: boolean) {
    this.masterControlOpen = open;
  }

  returnToLobby() {
    this.net?.destroy?.();
    this.net = null;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = null;
    this.toast = null;
    this.screen = "start";
    this.gameState = null;
    this.localPid = null;
    this.pendingAction = null;
    this.pendingAdminAction = null;
    this.roomCode = null;
    this.joiningName = "";
    this.pendingHumans = [];
    this.connectionStatus = "idle";
    this.connectionStatusDetail = "";
    this.lastStateUpdateAt = null;
    this.lastStateVersion = null;
    this.playerConnectionStatus = {};
    this.lobbyStatus = "";
    this.resetJoinDiagnostics();
    this.lobbyConnectionEvents = [];
  }

  private resetJoinDiagnostics() {
    this.connectionEvents = [];
    this.lastJoinFailure = null;
  }

  private recordJoinDiagnostic(event: JoinDiagnosticEvent) {
    const row: TrackedJoinDiagnostic = {
      ...event,
      id: this.connectionDiagnosticSeq++,
    };
    this.connectionEvents = [...this.connectionEvents, row].slice(-12);
  }

  private recordLobbyConnectionEvent(
    name: string,
    status: LobbyConnectionEvent["status"],
    detail: string,
  ) {
    this.lobbyConnectionEvents = [
      {
        id: this.lobbyConnectionEventSeq++,
        at: Date.now(),
        name,
        status,
        detail,
      },
      ...this.lobbyConnectionEvents,
    ].slice(0, 5);
  }

  getJoinDiagnosticsReport() {
    const failure = this.lastJoinFailure;
    const lines = [
      "Catan join diagnostics",
      `Generated: ${new Date().toISOString()}`,
      `Room: ${failure?.roomCode ?? this.roomCode ?? "unknown"}`,
      `Status: ${this.connectionStatus} ${this.connectionStatusDetail ? `(${this.connectionStatusDetail})` : ""}`,
    ];

    if (failure) {
      lines.push(
        `Failure: ${failure.message}`,
        `Hint: ${failure.hint}`,
        `Stage: ${failure.stage}`,
        `Source: ${failure.source ?? "unknown"}`,
        `PeerJS error type: ${failure.errorType ?? "n/a"}`,
        `Client peer id: ${failure.peerId ?? "n/a"}`,
        `Elapsed: ${failure.elapsedMs ?? "n/a"}ms`,
      );
    }

    if (this.connectionEvents.length > 0) {
      lines.push("", "Events:");
      for (const event of this.connectionEvents) {
        lines.push(
          [
            new Date(event.at).toISOString(),
            event.status,
            event.stage,
            event.source ?? "unknown",
            event.message,
            event.errorType ? `type=${event.errorType}` : "",
            typeof event.elapsedMs === "number" ? `${event.elapsedMs}ms` : "",
            event.online === false ? "offline" : "",
          ]
            .filter(Boolean)
            .join(" | "),
        );
      }
    }

    return lines.join("\n");
  }

  applyStateUpdate(state: GameState) {
    const previous = this.gameState;

    this.prevPhase = previous?.phase ?? null;
    this.gameState = state;
    this.lastStateUpdateAt = Date.now();
    this.lastStateVersion = state.version;
    this.pruneVisualEvents();
    if (previous) {
      this.emitVisualFeedback(previous, state);
    }

    if (this.screen !== "game") this.screen = "game";
    if (!this.localPid && this.net?.myPid) this.localPid = this.net.myPid;
    if (this.connectionStatus !== "connected") {
      this.setConnectionStatus("connected", "State synced", true);
    }
  }

  private emitVisualFeedback(previous: GameState, next: GameState) {
    if (previous.version === next.version) return;

    const cardDeltas = computePlayerCardDeltaEvents(previous, next);
    for (const delta of cardDeltas) {
      this.pushCardDeltaToast(delta.pid, delta.tokens);
    }

    const roll = next.lastRoll;
    if (previous.lastRoll?.id !== roll?.id && roll) {
      const production = roll.dice[0] + roll.dice[1];
      if (production !== 7) {
        this.pushHexGlowEvent(getProducingHexIds(next, production));
      }
    }

    const appendedLogs = next.log.slice(previous.log.length);
    for (const line of appendedLogs) {
      if (line.includes("[card:Mining]")) {
        this.pushTerrainCardGlow(next, "mountains", line);
      }
      if (line.includes("[card:Irrigation]")) {
        this.pushTerrainCardGlow(next, "fields", line);
      }
    }
  }

  private pushTerrainCardGlow(
    state: GameState,
    terrain: TerrainType,
    logLine: string,
  ) {
    const pid = this.findPlayerIdFromPlayedCardLog(state, logLine);
    if (!pid) return;

    const hexIds = getTerrainGlowHexesForPlayer(state, pid, terrain);
    if (hexIds.length > 0) {
      this.pushHexGlowEvent(hexIds);
    }
  }

  private findPlayerIdFromPlayedCardLog(
    state: GameState,
    logLine: string,
  ): PlayerId | null {
    const playedIdx = logLine.indexOf(" played ");
    if (playedIdx <= 0) return null;

    const playerName = logLine.slice(0, playedIdx).trim();
    const entry = Object.entries(state.players).find(
      ([, p]) => p.name === playerName,
    );
    return (entry?.[0] as PlayerId | undefined) ?? null;
  }

  private pushCardDeltaToast(pid: PlayerId, tokens: CardDeltaToken[]) {
    const id = this.visualEventSeq++;
    const expiresAt = Date.now() + 3500;
    this.cardDeltaToasts = [
      ...this.cardDeltaToasts,
      { id, pid, tokens, expiresAt },
    ];
  }

  private pushHexGlowEvent(hexIds: HexId[]) {
    const uniqueHexIds = Array.from(new Set(hexIds));
    if (uniqueHexIds.length === 0) return;

    const id = this.visualEventSeq++;
    const expiresAt = Date.now() + 1600;
    this.hexGlowEvents = [
      ...this.hexGlowEvents,
      { id, hexIds: uniqueHexIds, expiresAt },
    ];
  }

  private pruneVisualEvents() {
    const now = Date.now();
    this.cardDeltaToasts = this.cardDeltaToasts.filter(
      (event) => event.expiresAt > now,
    );
    this.hexGlowEvents = this.hexGlowEvents.filter(
      (event) => event.expiresAt > now,
    );
  }

  tickVisualEffects() {
    this.pruneVisualEvents();
  }

  sendAction(action: GameAction) {
    this.net?.sendAction(action);
    this.pendingAction = null;
    this.pendingAdminAction = null;
  }

  setPendingAction(pa: PendingAction | null) {
    this.pendingAction = pa;
  }

  setPendingAdminAction(pa: PendingAdminAction | null) {
    this.pendingAdminAction = pa;
  }

  broadcastCurrentLobby() {
    this.net?.broadcastLobbyState({
      hostName: this.hostName,
      pendingNames: [...this.pendingHumans],
      bots: [...this.bots],
    });
  }

  addBot() {
    const total = 1 + this.pendingHumans.length + this.bots.length;
    if (total >= 4) return;
    this.bots.push({ name: `Bot ${total + 1}` });
    this.broadcastCurrentLobby();
  }

  removeBot(idx: number) {
    this.bots.splice(idx, 1);
    this.broadcastCurrentLobby();
  }

  setBoardPreset(preset: BoardPreset) {
    this.boardPreset = preset;
    saveBoardPreset(preset);
  }

  async hostGame(name: string) {
    this.hostName = name;
    this.setLobbyStatus("Creating room…");
    this.pendingHumans = [];
    this.bots = [];
    this.boardPreset = loadCatanProfile().boardPreset;
    this.playerConnectionStatus = {};
    this.lobbyConnectionEvents = [];
    this.resetJoinDiagnostics();
    this.lastStateUpdateAt = null;
    this.lastStateVersion = null;
    this.setConnectionStatus("connecting", "Creating room…");

    this.net = new CatanNetwork({
      onStateUpdate: (state) => this.applyStateUpdate(state),
      onError: (msg) => this.showToast(msg, "error"),
      onConnectionStatusChange: (status, detail) => {
        this.setConnectionStatus(status, detail, true);
      },
      onPlayerConnectionChange: (pid, status, detail) => {
        this.playerConnectionStatus = {
          ...this.playerConnectionStatus,
          [pid]: status,
        };
        const playerName = this.gameState?.players[pid]?.name ?? pid;
        if (status === "disconnected") {
          this.showToast(`${playerName} disconnected`, "error");
        } else if (status === "connected") {
          this.showToast(detail ?? `${playerName} connected`, "info");
        }
      },
      onPendingJoin: (pname) => {
        this.pendingHumans.push(pname);
        this.recordLobbyConnectionEvent(
          pname,
          "pending",
          "Waiting in lobby",
        );
        this.showToast(`${pname} is waiting to join`, "info");
        this.broadcastCurrentLobby();
      },
      onPendingJoinClosed: (pname, detail) => {
        const idx = this.pendingHumans.indexOf(pname);
        if (idx !== -1) this.pendingHumans.splice(idx, 1);
        this.recordLobbyConnectionEvent(pname, "disconnected", detail);
        this.showToast(`${pname} left lobby`, "error");
        this.broadcastCurrentLobby();
      },
      onPlayerJoined: (pname) => this.showToast(`${pname} joined`, "info"),
    });

    try {
      this.roomCode = await this.net.hostGame("player1");
      this.setLobbyStatus("");
      this.setConnectionStatus("connected", "Room created");
      this.screen = "lobby";
      this.broadcastCurrentLobby();
    } catch (e: unknown) {
      this.net = null;
      const msg = e instanceof Error ? e.message : String(e);
      this.setConnectionStatus(
        "disconnected",
        msg || "Failed to host",
        true,
      );
      this.setLobbyStatus(`Failed: ${msg || "unknown error"}`, "error");
    }
  }

  startGame() {
    if (!this.net) return;
    const totalSlots = 1 + this.pendingHumans.length + this.bots.length;
    if (totalSlots < 2) return;

    const players = [
      {
        id: "player1" as PlayerId,
        name: this.hostName,
        color: PLAYER_COLORS[0]!,
        isBot: false,
      },
      ...this.pendingHumans.map((pname, i) => ({
        id: `player${2 + i}` as PlayerId,
        name: pname,
        color: PLAYER_COLORS[1 + i] ?? "#999",
        isBot: false,
      })),
      ...this.bots.map((bot, i) => ({
        id: `player${2 + this.pendingHumans.length + i}` as PlayerId,
        name: bot.name,
        color: PLAYER_COLORS[1 + this.pendingHumans.length + i] ?? "#999",
        isBot: true,
      })),
    ];

    this.localPid = "player1";
    const initialState = createInitialState(players, {
      boardPreset: this.boardPreset,
    });
    // Seed UI with initial snapshot; initHostState may immediately advance it
    // if a bot is first in turn order.
    this.gameState = initialState;
    this.lastStateUpdateAt = Date.now();
    this.lastStateVersion = initialState.version;
    this.screen = "game";

    this.net.updateCallbacks({
      onStateUpdate: (state) => this.applyStateUpdate(state),
    });
    this.net.initHostState(initialState);
  }

  async joinGame(name: string, code: string) {
    const roomCode = code.trim();
    const sessionKey = `catan-pid-${roomCode}`;
    const savedPid = sessionStorage.getItem(sessionKey) as PlayerId | null;

    this.joiningName = name;
    this.setLobbyStatus("Connecting…");
    this.setConnectionStatus("connecting", "Connecting to host…");
    this.resetJoinDiagnostics();
    this.lastStateUpdateAt = null;
    this.lastStateVersion = null;

    this.net = new CatanNetwork({
      onStateUpdate: (state) => {
        if (!this.localPid) {
          this.localPid = this.net!.myPid;
          if (this.localPid) sessionStorage.setItem(sessionKey, this.localPid);
        }
        this.applyStateUpdate(state);
      },
      onLobbyUpdate: (data) => {
        this.hostName = data.hostName;
        this.pendingHumans = [...data.pendingNames];
        this.bots = [...data.bots];
        this.roomCode = roomCode;
        this.screen = "lobby";
        this.setLobbyStatus("");
        this.lastJoinFailure = null;
      },
      onError: (msg) => this.showToast(msg, "error"),
      onConnectionStatusChange: (status, detail) => {
        this.setConnectionStatus(status, detail, true);
      },
      onJoinDiagnostic: (event) => this.recordJoinDiagnostic(event),
      onJoinFailure: (failure) => {
        this.lastJoinFailure = failure;
      },
    });

    try {
      await this.net.joinGame(roomCode, name, savedPid ?? undefined);
      this.setConnectionStatus("connected", "Connected to host");
      this.lastJoinFailure = null;
    } catch (e: unknown) {
      this.net = null;
      const msg = e instanceof Error ? e.message : String(e);
      const hint = isJoinFailureError(e) ? ` ${e.hint}` : "";
      this.setConnectionStatus(
        "disconnected",
        msg || "Failed to join",
        true,
      );
      this.setLobbyStatus(
        `Failed: ${msg || "connection error"}.${hint}`,
        "error",
      );
      this.showToast(`Failed to join: ${msg}`, "error");
    }
  }
}

export const store = new CatanStore();
