/**
 * network.ts — PeerJS wrapper for Catan C&K multiplayer
 *
 * Host creates a room (peer.id = room code), validates actions, broadcasts state.
 * Clients connect to host's peer.id, send actions, receive state updates.
 * Bot turns run only on the host after every state update.
 */
import Peer, { type DataConnection } from "peerjs";
import {
  type GameState,
  type GameAction,
  type PlayerId,
  type TurnPhase,
  isAdminAction,
} from "./types.js";
import { applyAction } from "./game.js";
import { chooseBotAction } from "./ai.js";
import { getActingPlayerIds } from "./turnActors.js";

export type LobbyData = {
  hostName: string;
  pendingNames: string[];
  bots: Array<{ name: string }>;
};

export type NetMessage =
  | { type: "join"; name: string; pid?: PlayerId } // pid present on reconnect
  | { type: "welcome"; pid: PlayerId; state: GameState }
  | { type: "lobby"; hostName: string; pendingNames: string[]; bots: Array<{ name: string }> }
  | { type: "action"; action: GameAction }
  | { type: "state"; state: GameState }
  | { type: "error"; msg: string };

export type JoinDiagnosticStage =
  | "peer-open"
  | "data-channel-open"
  | "host-state";

export type JoinDiagnosticStatus = "info" | "success" | "error";

export interface JoinDiagnosticEvent {
  at: number;
  stage: JoinDiagnosticStage;
  status: JoinDiagnosticStatus;
  message: string;
  hint?: string;
  source?: string;
  roomCode?: string;
  peerId?: string;
  elapsedMs?: number;
  errorType?: string;
  online?: boolean;
  userAgent?: string;
}

export interface JoinFailure extends Error {
  name: "CatanJoinFailure";
  stage: JoinDiagnosticStage;
  message: string;
  hint: string;
  source?: string;
  roomCode?: string;
  peerId?: string;
  elapsedMs?: number;
  errorType?: string;
}

interface PeerJoinErrorDetails {
  message: string;
  hint: string;
  errorType?: string;
}

const PEERJS_SIGNALING_UNREACHABLE_MESSAGE =
  "Could not reach PeerJS signaling server";

const PEERJS_SIGNALING_CLASSIFY_HINT =
  "Check internet access, VPN/firewall settings, or try again in a moment.";

const PEERJS_SIGNALING_TIMEOUT_PEER_OPEN_HINT =
  "The PeerJS server did not assign a client id in time. Check connectivity or try again.";

const JOIN_STAGE_TIMEOUT_MS: Record<JoinDiagnosticStage, number> = {
  "peer-open": 12000,
  "data-channel-open": 12000,
  "host-state": 15000,
};

class CatanJoinFailure extends Error implements JoinFailure {
  name = "CatanJoinFailure" as const;
  stage: JoinDiagnosticStage;
  hint: string;
  source?: string;
  roomCode?: string;
  peerId?: string;
  elapsedMs?: number;
  errorType?: string;

  constructor(details: Omit<JoinFailure, "name">) {
    super(details.message);
    this.stage = details.stage;
    this.hint = details.hint;
    this.source = details.source;
    this.roomCode = details.roomCode;
    this.peerId = details.peerId;
    this.elapsedMs = details.elapsedMs;
    this.errorType = details.errorType;
  }
}

/** Runtime check for join rejections thrown from `joinGame`. */
export function isJoinFailureError(e: unknown): e is JoinFailure {
  return (
    e instanceof Error &&
    (e as { name?: string }).name === "CatanJoinFailure" &&
    typeof (e as JoinFailure).hint === "string" &&
    typeof (e as JoinFailure).stage === "string"
  );
}

export function classifyPeerJoinError(error: unknown): PeerJoinErrorDetails {
  const err = error as { type?: unknown; message?: unknown };
  const errorType = typeof err?.type === "string" ? err.type : undefined;
  const rawMessage =
    typeof err?.message === "string" && err.message.trim()
      ? err.message.trim()
      : typeof error === "string"
        ? error
        : "";

  switch (errorType) {
    case "peer-unavailable":
      return {
        message: "Room not found",
        hint: "Check the room code, or ask the host to reopen the lobby.",
        errorType,
      };
    case "network":
    case "server-error":
    case "socket-error":
    case "socket-closed":
      return {
        message: PEERJS_SIGNALING_UNREACHABLE_MESSAGE,
        hint: PEERJS_SIGNALING_CLASSIFY_HINT,
        errorType,
      };
    case "webrtc":
      return {
        message: "WebRTC connection failed",
        hint: "One player's network may block direct peer connections; try another network or hotspot.",
        errorType,
      };
    case "browser-incompatible":
      return {
        message: "Browser does not support WebRTC",
        hint: "Try the latest Safari, Chrome, Firefox, or Edge.",
        errorType,
      };
    case "invalid-id":
      return {
        message: "Room code is invalid",
        hint: "Copy the room code again from the host.",
        errorType,
      };
    default:
      return {
        message: rawMessage || "Failed to connect",
        hint: "Try again, or copy diagnostics so the error can be investigated later.",
        errorType,
      };
  }
}

export function createJoinTimeoutFailure(
  stage: JoinDiagnosticStage,
  context: {
    roomCode?: string;
    peerId?: string;
    elapsedMs?: number;
    source?: string;
  } = {},
): JoinFailure {
  const stageText: Record<JoinDiagnosticStage, PeerJoinErrorDetails> = {
    "peer-open": {
      message: PEERJS_SIGNALING_UNREACHABLE_MESSAGE,
      hint: PEERJS_SIGNALING_TIMEOUT_PEER_OPEN_HINT,
    },
    "data-channel-open": {
      message: "Could not open connection to host",
      hint: "The room may be gone, the code may be wrong, or the networks may not allow direct WebRTC.",
    },
    "host-state": {
      message: "Host did not answer",
      hint: "The host connection opened, but no lobby/game state arrived. Ask the host to keep the lobby open and try again.",
    },
  };
  const details = stageText[stage];
  return new CatanJoinFailure({
    stage,
    message: details.message,
    hint: details.hint,
    source: context.source ?? "timeout",
    roomCode: context.roomCode,
    peerId: context.peerId,
    elapsedMs: context.elapsedMs,
  });
}

function createJoinFailureFromError(
  stage: JoinDiagnosticStage,
  error: unknown,
  context: {
    roomCode?: string;
    peerId?: string;
    elapsedMs?: number;
    source?: string;
  } = {},
): JoinFailure {
  const details = classifyPeerJoinError(error);
  return new CatanJoinFailure({
    stage,
    message: details.message,
    hint: details.hint,
    source: context.source,
    roomCode: context.roomCode,
    peerId: context.peerId,
    elapsedMs: context.elapsedMs,
    errorType: details.errorType,
  });
}

function getMonotonicNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function getDiagnosticEnvironment() {
  return {
    online: typeof navigator !== "undefined" ? navigator.onLine : undefined,
    userAgent:
      typeof navigator !== "undefined" ? navigator.userAgent : undefined,
  };
}

// ─── Callbacks ────────────────────────────────────────────────────────────────

export interface NetworkCallbacks {
  onStateUpdate(state: GameState): void;
  onError(msg: string): void;
  onLobbyUpdate?(data: LobbyData): void;
  onPlayerJoined?(name: string, pid: PlayerId): void;
  onPendingJoin?(name: string): void;
  onConnectionStatusChange?(
    status:
      | "idle"
      | "connecting"
      | "connected"
      | "reconnecting"
      | "disconnected",
    detail?: string,
  ): void;
  onPlayerConnectionChange?(
    pid: PlayerId,
    status: "connected" | "disconnected",
    detail?: string,
  ): void;
  onJoinDiagnostic?(event: JoinDiagnosticEvent): void;
  onJoinFailure?(failure: JoinFailure): void;
  onPendingJoinClosed?(name: string, detail: string): void;
  onReady?(): void;
}

// ─── Network Manager ──────────────────────────────────────────────────────────

export class CatanNetwork {
  private peer: Peer | null = null;
  private connections: Map<PlayerId, DataConnection> = new Map();
  private isHost = false;
  private localPid: PlayerId | null = null;
  private state: GameState | null = null;
  private destroyed = false;
  private botTurnTimer: ReturnType<typeof setTimeout> | null = null;
  private callbacks: NetworkCallbacks;
  private pendingJoins: Array<{ conn: DataConnection; name: string }> = [];
  private preGameConns: DataConnection[] = [];
  private currentLobbyState: LobbyData | null = null;
  private lastAdminSnapshot: GameState | null = null;
  private connToPid: WeakMap<DataConnection, PlayerId> = new WeakMap();

  constructor(callbacks: NetworkCallbacks) {
    this.callbacks = callbacks;
  }

  // ─── Host ──────────────────────────────────────────────────────────────────

  /**
   * Creates a new PeerJS peer. Returns the room code (= peer.id).
   * The host must call `initHostState(state)` once the game starts.
   */
  async hostGame(hostPid: PlayerId): Promise<string> {
    this.isHost = true;
    this.localPid = hostPid;
    this.callbacks.onConnectionStatusChange?.(
      "connecting",
      "Starting host peer",
    );

    return new Promise((resolve, reject) => {
      this.peer = new Peer();

      this.peer.on("open", (id) => {
        this.callbacks.onConnectionStatusChange?.("connected", "Hosting room");
        resolve(id as string);
      });
      this.peer.on("error", (err) => {
        reject(err instanceof Error ? err : new Error(String(err)));
      });

      this.peer.on("connection", (...args) => {
        const conn = args[0] as DataConnection;
        conn.on("open", () => {
          conn.on("data", (msg) =>
            this.handleHostMessage(conn, msg as NetMessage),
          );
        });
        conn.on("close", () => {
          this.handleHostConnectionClosed(conn, "Connection closed");
        });
        conn.on("error", (e) => {
          console.warn("[host] conn error", e);
          this.handleHostConnectionClosed(conn, "Connection error");
        });
      });
    });
  }

  initHostState(state: GameState) {
    this.state = state;
    // Process any joins that arrived before the game state was ready
    for (const { conn, name } of this.pendingJoins) {
      const pid = this.findPendingSlot(name);
      if (!pid) {
        conn.send({ type: "error", msg: "No open slot" } satisfies NetMessage);
        continue;
      }
      this.connections.set(pid, conn);
      this.connToPid.set(conn, pid);
      conn.send({
        type: "welcome",
        pid,
        state: this.state,
      } satisfies NetMessage);
      this.callbacks.onPlayerJoined?.(name, pid);
      this.callbacks.onPlayerConnectionChange?.(
        pid,
        "connected",
        `${name} connected`,
      );
    }
    this.pendingJoins = [];
    this.preGameConns = [];
    this.currentLobbyState = null;
    if (this.connections.size > 0) this.broadcastState();
    this.callbacks.onReady?.();
    this.runBotTurns();
  }

  broadcastLobbyState(data: LobbyData) {
    this.currentLobbyState = data;
    const msg: NetMessage = { type: "lobby", ...data };
    for (const conn of this.preGameConns) {
      try { conn.send(msg); } catch { /* ignore */ }
    }
  }

  updateCallbacks(callbacks: Partial<NetworkCallbacks>) {
    Object.assign(this.callbacks, callbacks);
  }

  private handleHostMessage(conn: DataConnection, msg: NetMessage) {
    if (msg.type === "join") {
      if (!this.state) {
        // Game not started yet — queue until initHostState is called
        this.pendingJoins.push({ conn, name: msg.name });
        this.preGameConns.push(conn);
        if (this.currentLobbyState) {
          try {
            conn.send({ type: "lobby", ...this.currentLobbyState } satisfies NetMessage);
          } catch { /* ignore */ }
        }
        this.callbacks.onPendingJoin?.(msg.name);
        return;
      }

      // Reconnect: client sends their previous pid
      if (
        msg.pid &&
        this.state.players[msg.pid] &&
        !this.state.players[msg.pid]!.isBot
      ) {
        const previous = this.connections.get(msg.pid);
        if (previous && previous !== conn) {
          try {
            previous.close?.();
          } catch {
            /* ignore stale close errors */
          }
        }
        this.connections.set(msg.pid, conn);
        this.connToPid.set(conn, msg.pid);
        conn.send({
          type: "welcome",
          pid: msg.pid,
          state: this.state,
        } satisfies NetMessage);
        this.callbacks.onPlayerJoined?.(msg.name, msg.pid);
        this.callbacks.onPlayerConnectionChange?.(
          msg.pid,
          "connected",
          `${msg.name} reconnected`,
        );
        return;
      }

      // New join: find a waiting human slot
      const pid = this.findPendingSlot(msg.name);
      if (!pid) {
        conn.send({ type: "error", msg: "No open slot" } satisfies NetMessage);
        return;
      }
      this.connections.set(pid, conn);
      this.connToPid.set(conn, pid);
      conn.send({
        type: "welcome",
        pid,
        state: this.state,
      } satisfies NetMessage);
      this.callbacks.onPlayerJoined?.(msg.name, pid);
      this.callbacks.onPlayerConnectionChange?.(
        pid,
        "connected",
        `${msg.name} connected`,
      );
      this.broadcastState();
    } else if (msg.type === "action") {
      if (isAdminAction(msg.action)) {
        conn.send({
          type: "error",
          msg: "Master controls are host-only",
        } satisfies NetMessage);
        return;
      }
      this.applyAndBroadcast(msg.action);
    }
  }

  private handleHostConnectionClosed(conn: DataConnection, detail: string) {
    const pid = this.connToPid.get(conn);
    if (!pid) {
      this.removePreGameConnection(conn, detail);
      return;
    }
    this.connToPid.delete(conn);
    const mapped = this.connections.get(pid);
    if (mapped === conn) {
      this.connections.delete(pid);
      this.callbacks.onPlayerConnectionChange?.(pid, "disconnected", detail);
    }
  }

  private removePreGameConnection(conn: DataConnection, detail: string) {
    const preGameIdx = this.preGameConns.indexOf(conn);
    if (preGameIdx !== -1) this.preGameConns.splice(preGameIdx, 1);

    const removedNames: string[] = [];
    this.pendingJoins = this.pendingJoins.filter((join) => {
      if (join.conn !== conn) return true;
      removedNames.push(join.name);
      return false;
    });

    for (const name of removedNames) {
      this.callbacks.onPendingJoinClosed?.(name, detail);
    }
  }

  private findPendingSlot(_name: string): PlayerId | null {
    if (!this.state) return null;
    // Find a non-bot, non-host, non-connected player
    for (const pid of this.state.playerOrder) {
      const p = this.state.players[pid]!;
      if (!p.isBot && pid !== this.localPid && !this.connections.has(pid)) {
        return pid;
      }
    }
    return null;
  }

  private applyAndBroadcast(action: GameAction) {
    if (!this.state) {
      this.callbacks.onError("Game not initialized");
      return;
    }
    try {
      if (isAdminAction(action)) {
        if (action.type === "ADMIN_UNDO_LAST") {
          if (!this.lastAdminSnapshot) {
            this.callbacks.onError("No master action to undo");
            return;
          }
          this.state = {
            ...this.lastAdminSnapshot,
            version: this.state.version + 1,
            log: [
              ...this.lastAdminSnapshot.log,
              "[MASTER] Last master action undone",
            ],
          };
          this.lastAdminSnapshot = null;
        } else {
          this.lastAdminSnapshot = this.state;
          this.state = applyAction(this.state, action);
        }
      } else {
        this.state = applyAction(this.state, action);
      }
      this.callbacks.onStateUpdate(this.state);
      this.broadcastState();
      this.runBotTurns();
    } catch (e: unknown) {
      const msg =
        (e instanceof Error ? e.message : String(e)) ?? "Invalid action";
      console.error("[catan] applyAction failed:", msg, action);
      // Show error to host directly
      this.callbacks.onError(msg);
      // Also forward to remote sender if applicable
      const pid = (action as any).pid as PlayerId | undefined;
      if (pid && this.connections.has(pid)) {
        this.connections
          .get(pid)!
          .send({ type: "error", msg } satisfies NetMessage);
      }
    }
  }

  private readonly BOT_BREAK_PHASES: TurnPhase[] = [
    "RESOLVE_PROGRESS_DRAW",
    "DISCARD",
    "DISCARD_PROGRESS",
    "KNIGHT_DISPLACE_RESPONSE",
    // Cinematic is playing on all clients; host dispatches EXECUTE_BARBARIAN_ATTACK
    // from the overlay when done. Stop the bot loop until then.
    "RESOLVE_BARBARIANS",
  ];

  private botTurnPending(): boolean {
    if (!this.state || this.state.phase === "GAME_OVER") return false;
    if (this.findQueuedBotPid()) return true;
    if (this.BOT_BREAK_PHASES.includes(this.state.phase)) return false;
    return !!this.state.players[this.state.currentPlayerId]?.isBot;
  }

  private runBotTurns() {
    if (this.destroyed || !this.state) return;
    const BATCH_SIZE = 100;
    let guard = 0;
    let prevVersion = -1;
    let noOpStreak = 0;
    const shouldBreakAfterAction = (before: number): boolean => {
      if (!this.state) return true;
      if (this.state.version === before) {
        return ++noOpStreak >= 2;
      }
      noOpStreak = 0;
      return this.state.version === before + 1 && prevVersion === before;
    };

    while (this.state.phase !== "GAME_OVER" && guard++ < BATCH_SIZE) {
      const queuedBotPid = this.findQueuedBotPid();
      if (queuedBotPid) {
        const before = this.state.version;
        const action = chooseBotAction(this.state, queuedBotPid);
        this.state = applyAction(this.state, action);
        if (shouldBreakAfterAction(before)) break;
        prevVersion = before;
        continue;
      }

      if (this.BOT_BREAK_PHASES.includes(this.state.phase)) break;

      if (!this.state.players[this.state.currentPlayerId]?.isBot) break;

      const before = this.state.version;
      const action = chooseBotAction(this.state, this.state.currentPlayerId);
      this.state = applyAction(this.state, action);
      if (shouldBreakAfterAction(before)) break;
      prevVersion = before;
    }

    if (guard > 0) {
      this.callbacks.onStateUpdate(this.state);
      this.broadcastState();
    }

    if (this.botTurnPending() && !this.destroyed) {
      if (this.botTurnTimer) clearTimeout(this.botTurnTimer);
      this.botTurnTimer = setTimeout(() => {
        this.botTurnTimer = null;
        this.runBotTurns();
      }, 0);
    }
  }

  private findQueuedBotPid(): PlayerId | null {
    if (!this.state) return null;

    return (
      getActingPlayerIds(this.state).find(
        (pid) => this.state!.players[pid]?.isBot,
      ) ?? null
    );
  }

  broadcastState() {
    if (!this.state) return;
    const msg: NetMessage = { type: "state", state: this.state };
    for (const conn of this.connections.values()) {
      try {
        conn.send(msg);
      } catch {
        this.handleHostConnectionClosed(conn, "Connection lost during sync");
      }
    }
  }

  private emitJoinDiagnostic(
    event: Omit<JoinDiagnosticEvent, "at" | "online" | "userAgent">,
  ) {
    this.callbacks.onJoinDiagnostic?.({
      ...event,
      at: Date.now(),
      ...getDiagnosticEnvironment(),
    });
  }

  // ─── Client ────────────────────────────────────────────────────────────────

  async joinGame(
    roomCode: string,
    playerName: string,
    existingPid?: PlayerId,
  ): Promise<void> {
    this.isHost = false;
    const startedAt = getMonotonicNow();
    this.callbacks.onConnectionStatusChange?.(
      "connecting",
      "Connecting to host",
    );
    this.emitJoinDiagnostic({
      stage: "peer-open",
      status: "info",
      message: "Opening PeerJS connection",
      source: "peer.new",
      roomCode,
      elapsedMs: 0,
    });
    return new Promise((resolve, reject) => {
      let settled = false;
      let rejecting = false;
      let activeStage: JoinDiagnosticStage = "peer-open";
      let stageTimer: ReturnType<typeof setTimeout> | null = null;
      let conn: DataConnection | null = null;
      const elapsedMs = () => Math.round(getMonotonicNow() - startedAt);
      const clearStageTimer = () => {
        if (stageTimer) clearTimeout(stageTimer);
        stageTimer = null;
      };
      const fail = (failure: JoinFailure) => {
        if (settled) return;
        this.emitJoinDiagnostic({
          stage: failure.stage,
          status: "error",
          message: failure.message,
          hint: failure.hint,
          source: failure.source,
          roomCode: failure.roomCode ?? roomCode,
          peerId: failure.peerId,
          elapsedMs: failure.elapsedMs,
          errorType: failure.errorType,
        });
        this.callbacks.onJoinFailure?.(failure);
        this.callbacks.onConnectionStatusChange?.(
          "disconnected",
          failure.message,
        );
        safeReject(failure);
      };
      const startStageTimeout = (stage: JoinDiagnosticStage) => {
        clearStageTimer();
        activeStage = stage;
        stageTimer = setTimeout(() => {
          fail(
            createJoinTimeoutFailure(stage, {
              roomCode,
              peerId: this.peer?.id,
              elapsedMs: elapsedMs(),
            }),
          );
        }, JOIN_STAGE_TIMEOUT_MS[stage]);
      };
      const safeResolve = () => {
        if (settled) return;
        settled = true;
        clearStageTimer();
        resolve();
      };
      const safeReject = (err: Error) => {
        if (settled) return;
        settled = true;
        rejecting = true;
        clearStageTimer();
        try {
          conn?.close();
        } catch {
          /* ignore close failures during cleanup */
        }
        try {
          this.peer?.destroy();
        } catch {
          /* ignore destroy failures during cleanup */
        }
        this.peer = null;
        reject(err);
      };

      startStageTimeout("peer-open");
      this.peer = new Peer();
      this.peer.on("error", (err) => {
        if (!settled) {
          fail(
            createJoinFailureFromError(activeStage, err, {
              roomCode,
              peerId: this.peer?.id,
              elapsedMs: elapsedMs(),
              source: "peer.error",
            }),
          );
        }
      });
      this.peer.on("disconnected", () => {
        this.emitJoinDiagnostic({
          stage: activeStage,
          status: "info",
          message: "Peer disconnected from signaling server",
          source: "peer.disconnected",
          roomCode,
          peerId: this.peer?.id,
          elapsedMs: elapsedMs(),
        });
        this.callbacks.onConnectionStatusChange?.(
          "reconnecting",
          "Peer disconnected, attempting reconnect",
        );
      });
      this.peer.on("close", () => {
        if (rejecting) return;
        this.emitJoinDiagnostic({
          stage: activeStage,
          status: "error",
          message: "Peer closed",
          source: "peer.close",
          roomCode,
          peerId: this.peer?.id,
          elapsedMs: elapsedMs(),
        });
        this.callbacks.onConnectionStatusChange?.(
          "disconnected",
          "Peer closed",
        );
      });
      this.peer.on("open", () => {
        const peer = this.peer;
        if (!peer) {
          if (!settled) {
            fail(
              createJoinFailureFromError("peer-open", "Peer not ready", {
                roomCode,
                elapsedMs: elapsedMs(),
                source: "peer.open",
              }),
            );
          }
          return;
        }
        this.emitJoinDiagnostic({
          stage: "peer-open",
          status: "success",
          message: "PeerJS client ready",
          source: "peer.open",
          roomCode,
          peerId: peer.id,
          elapsedMs: elapsedMs(),
        });
        startStageTimeout("data-channel-open");
        const hostConn = peer.connect(roomCode);
        conn = hostConn;
        hostConn.on("error", (err) => {
          if (!settled) {
            fail(
              createJoinFailureFromError(activeStage, err, {
                roomCode,
                peerId: peer.id,
                elapsedMs: elapsedMs(),
                source: "conn.error",
              }),
            );
          } else {
            const e = err instanceof Error ? err : new Error(String(err));
            this.callbacks.onConnectionStatusChange?.(
              "disconnected",
              e.message || "Host connection error",
            );
          }
        });
        hostConn.on("open", () => {
          this.emitJoinDiagnostic({
            stage: "data-channel-open",
            status: "success",
            message: "Data channel opened",
            source: "conn.open",
            roomCode,
            peerId: peer.id,
            elapsedMs: elapsedMs(),
          });
          startStageTimeout("host-state");
          this.callbacks.onConnectionStatusChange?.(
            "connecting",
            "Connected to room, waiting for host state",
          );
          const joinMsg: NetMessage = existingPid
            ? { type: "join", name: playerName, pid: existingPid }
            : { type: "join", name: playerName };
          hostConn.send(joinMsg);
          hostConn.on("data", (msg) => {
            const m = msg as NetMessage;
            if (m.type === "welcome") {
              this.localPid = m.pid;
              this.state = m.state;
              this.callbacks.onStateUpdate(m.state);
              this.emitJoinDiagnostic({
                stage: "host-state",
                status: "success",
                message: "Received game state from host",
                source: "message.welcome",
                roomCode,
                peerId: peer.id,
                elapsedMs: elapsedMs(),
              });
              this.callbacks.onConnectionStatusChange?.(
                "connected",
                "Connected to host",
              );
              safeResolve();
            } else if (m.type === "lobby") {
              const { hostName, pendingNames, bots } = m;
              this.callbacks.onLobbyUpdate?.({ hostName, pendingNames, bots });
              this.emitJoinDiagnostic({
                stage: "host-state",
                status: "success",
                message: "Received lobby state from host",
                source: "message.lobby",
                roomCode,
                peerId: peer.id,
                elapsedMs: elapsedMs(),
              });
              this.callbacks.onConnectionStatusChange?.(
                "connected",
                "Connected to host",
              );
              safeResolve();
            } else if (m.type === "state") {
              this.state = m.state;
              this.callbacks.onStateUpdate(m.state);
            } else if (m.type === "error") {
              this.callbacks.onError(m.msg);
              if (!settled) {
                fail(
                  new CatanJoinFailure({
                    stage: activeStage,
                    message: m.msg,
                    hint: "The host rejected the join request. Check available lobby slots and try again.",
                    source: "message.error",
                    roomCode,
                    peerId: peer.id,
                    elapsedMs: elapsedMs(),
                  }),
                );
              }
            }
          });
          hostConn.on("close", () => {
            if (rejecting) return;
            this.emitJoinDiagnostic({
              stage: activeStage,
              status: "error",
              message: "Lost connection to host",
              source: "conn.close",
              roomCode,
              peerId: peer.id,
              elapsedMs: elapsedMs(),
            });
            this.callbacks.onConnectionStatusChange?.(
              "disconnected",
              "Lost connection to host",
            );
          });
          this.connections.set("host", hostConn);
        });
      });
    });
  }

  // ─── Shared ────────────────────────────────────────────────────────────────

  sendAction(action: GameAction) {
    if (this.isHost) {
      this.applyAndBroadcast(action);
    } else {
      if (isAdminAction(action)) {
        this.callbacks.onError("Master controls are host-only");
        return;
      }
      const hostConn = this.connections.get("host");
      if (!hostConn) {
        this.callbacks.onConnectionStatusChange?.(
          "disconnected",
          "Not connected to host",
        );
        this.callbacks.onError("Not connected to host");
        return;
      }
      try {
        hostConn.send({ type: "action", action } satisfies NetMessage);
      } catch {
        this.callbacks.onConnectionStatusChange?.(
          "disconnected",
          "Failed to send action to host",
        );
        this.callbacks.onError("Failed to send action to host");
      }
    }
  }

  get myPid(): PlayerId | null {
    return this.localPid;
  }
  get currentState(): GameState | null {
    return this.state;
  }
  get hostAuthority(): boolean {
    return this.isHost;
  }

  destroy() {
    this.destroyed = true;
    if (this.botTurnTimer) {
      clearTimeout(this.botTurnTimer);
      this.botTurnTimer = null;
    }
    this.peer?.destroy();
    this.peer = null;
    this.connections.clear();
  }
}
