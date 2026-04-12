/**
 * store.svelte.ts — Shared reactive singleton for all Catan UI state.
 * Uses Svelte 5 $state in a class (Svelte 5 requires property mutation,
 * not rebinding, for exported reactive state).
 *
 * IMPORTANT: `net` is a plain property, NOT $state — PeerJS objects must not
 * be proxied (circular refs + internal event emitters break P2P).
 */

import type { GameState, GameAction, PlayerId, ProgressCard } from "./types.js";
import { createInitialState } from "./game.js";
import type { BoardPreset } from "./game.js";
import { CatanNetwork } from "./network.js";
import { PLAYER_COLORS } from "./constants.js";
import type { PendingAction } from "./validTargets.js";

export type Screen = "lobby" | "waiting" | "game";
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
      canAutoPlay: boolean;
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
    };

class CatanStore {
  // ── Screens & game ────────────────────────────────────────────────────────
  screen = $state<Screen>("lobby");
  gameState = $state<GameState | null>(null);
  localPid = $state<PlayerId | null>(null);
  pendingAction = $state<PendingAction | null>(null);

  // ── Lobby / waiting room ──────────────────────────────────────────────────
  roomCode = $state<string | null>(null);
  hostName = $state("Player 1");
  pendingHumans = $state<string[]>([]);
  bots = $state<Array<{ name: string }>>([]);
  boardPreset = $state<BoardPreset>("A");
  lobbyStatus = $state("");
  lobbyStatusKind = $state<"info" | "error">("info");

  // ── Network diagnostics ───────────────────────────────────────────────────
  connectionStatus = $state<ConnectionStatus>("idle");
  connectionStatusDetail = $state("");
  lastStateUpdateAt = $state<number | null>(null);
  lastStateVersion = $state<number | null>(null);
  playerConnectionStatus = $state<Partial<Record<PlayerId, "connected" | "disconnected">>>({});

  // ── Toast ─────────────────────────────────────────────────────────────────
  toast = $state<{ msg: string; kind: "info" | "error" } | null>(null);
  infoModal = $state<InfoModalState | null>(null);
  masterControlOpen = $state(false);

  // ── Non-reactive (must not be proxied) ────────────────────────────────────
  net: CatanNetwork | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private lastConnectionToastStatus: ConnectionStatus = "idle";

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

    if (!toastOnChange || previous === status || this.lastConnectionToastStatus === status)
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

  applyStateUpdate(state: GameState) {
    this.gameState = state;
    this.lastStateUpdateAt = Date.now();
    this.lastStateVersion = state.version;
    if (this.screen !== "game") this.screen = "game";
    if (!this.localPid && this.net?.myPid) this.localPid = this.net.myPid;
    if (this.connectionStatus !== "connected") {
      this.setConnectionStatus("connected", "State synced", true);
    }
  }

  sendAction(action: GameAction) {
    this.net?.sendAction(action);
    this.pendingAction = null;
  }

  setPendingAction(pa: PendingAction | null) {
    this.pendingAction = pa;
  }

  addBot() {
    const total = 1 + this.pendingHumans.length + this.bots.length;
    if (total >= 4) return;
    this.bots.push({ name: `Bot ${total + 1}` });
  }

  removeBot(idx: number) {
    this.bots.splice(idx, 1);
  }

  async hostGame(name: string) {
    this.hostName = name;
    this.setLobbyStatus("Creating room…");
    this.pendingHumans = [];
    this.bots = [];
    this.boardPreset = "A";
    this.playerConnectionStatus = {};
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
        this.showToast(`${pname} is waiting to join`, "info");
      },
      onPlayerJoined: (pname) => this.showToast(`${pname} joined`, "info"),
    });

    try {
      this.roomCode = await this.net.hostGame("player1");
      this.setConnectionStatus("connected", "Room created");
      this.screen = "waiting";
    } catch (e: any) {
      this.net = null;
      this.setConnectionStatus("disconnected", e?.message ?? "Failed to host", true);
      this.setLobbyStatus(`Failed: ${e?.message ?? "unknown error"}`, "error");
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
    const sessionKey = `catan-pid-${code}`;
    const savedPid = sessionStorage.getItem(sessionKey) as PlayerId | null;

    this.setLobbyStatus("Connecting…");
    this.setConnectionStatus("connecting", "Connecting to host…");
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
      onError: (msg) => this.showToast(msg, "error"),
      onConnectionStatusChange: (status, detail) => {
        this.setConnectionStatus(status, detail, true);
      },
    });

    try {
      await this.net.joinGame(code, name, savedPid ?? undefined);
      this.setConnectionStatus("connected", "Connected to host");
    } catch (e: any) {
      this.net = null;
      this.setConnectionStatus("disconnected", e?.message ?? "connection error", true);
      this.setLobbyStatus(
        `Failed: ${e?.message ?? "connection error"}`,
        "error",
      );
      this.showToast(`Failed to join: ${e?.message}`, "error");
    }
  }
}

export const store = new CatanStore();
