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
  // pid: saved seat (reconnect). clientId: stable per-tab id, so the host can
  // recognise the same tab coming back without guessing from names.
  | { type: "join"; name: string; pid?: PlayerId; clientId?: string }
  | { type: "welcome"; pid: PlayerId; state: GameState }
  | { type: "lobby"; hostName: string; pendingNames: string[]; bots: Array<{ name: string }> }
  | { type: "action"; action: GameAction }
  | { type: "state"; state: GameState }
  | {
      type: "error";
      msg: string;
      retryable?: boolean;
      /** "not-seated": host has no seat bound to this connection — rejoin. */
      code?: "not-seated";
    }
  | { type: "ping" }
  | { type: "pong" };

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
  /** Host refused for now (seat held); trying again later may succeed. */
  retryable?: boolean;
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

// ─── Reconnect / liveness tuning ─────────────────────────────────────────────

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 10_000;
/** Max reconnect attempts before a client gives up and shows "Reconnect". */
const CLIENT_MAX_RECONNECT_ATTEMPTS = 12;
/**
 * Hard cap on total time spent auto-reconnecting. Attempts can each spend up
 * to the join stage timeouts (≈40s) on top of backoff, so the attempt count
 * alone could stretch to several minutes.
 */
const CLIENT_RECONNECT_BUDGET_MS = 120_000;
/** First join: retries while the host says our seat is still held. */
const JOIN_SEAT_IN_USE_RETRIES = 5;
/** Client → host ping cadence. */
const HEARTBEAT_INTERVAL_MS = 4000;
/** No reply to a ping for this long ⇒ the data channel is dead. */
const HEARTBEAT_TIMEOUT_MS = 10_000;
/** Faster probe right after the page becomes visible again. */
const RESUME_PROBE_TIMEOUT_MS = 3000;
/**
 * Host drops a client that has pinged before but has been silent this long.
 * Must exceed Chrome's intensive throttling of hidden tabs (timers ~1/min),
 * or backgrounded players flap. Quick rejoins don't wait for this: a quiet
 * seat (REJOIN_STALE_MS) can be reclaimed by its owner.
 */
const HOST_CLIENT_TIMEOUT_MS = 90_000;
/**
 * A seat holder silent this long (> one missed ping) may be replaced by a
 * rejoining client. A live client pings every HEARTBEAT_INTERVAL_MS.
 */
const REJOIN_STALE_MS = 6000;
/**
 * A lobby player whose connection closes is kept listed this long, so a
 * quick reconnect (phone lock, app switch) swaps in without "left lobby".
 */
const LOBBY_LEAVE_GRACE_MS = 10_000;
const SEAT_IN_USE_MSG = "That seat is in use on another device";

/** Exponential backoff: 1s, 2s, 4s, 8s, then capped at 10s. */
export function reconnectDelayMs(attempt: number): number {
  return Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_DELAY_MS);
}

/** PeerJS error types that mean "lost the signaling server", not "bad room". */
const SIGNALING_ERROR_TYPES = new Set([
  "network",
  "server-error",
  "socket-error",
  "socket-closed",
  "unavailable-id",
  "disconnected",
]);

/** Names compare case/whitespace-insensitively ("alice " === "Alice"). */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** The player an action is performed by (trade actions use from/to). */
export function actionActorPid(action: GameAction): PlayerId | undefined {
  switch (action.type) {
    case "TRADE_OFFER":
    case "TRADE_CONFIRM":
    case "TRADE_CANCEL":
      return action.from;
    case "TRADE_ACCEPT":
    case "TRADE_REJECT":
      return action.to;
    default:
      return (action as { pid?: PlayerId }).pid;
  }
}

function netLog(...args: unknown[]) {
  console.info("[catan-net]", ...args);
}

class CatanJoinFailure extends Error implements JoinFailure {
  name = "CatanJoinFailure" as const;
  stage: JoinDiagnosticStage;
  hint: string;
  source?: string;
  roomCode?: string;
  peerId?: string;
  elapsedMs?: number;
  errorType?: string;
  retryable?: boolean;

  constructor(details: Omit<JoinFailure, "name">) {
    super(details.message);
    this.retryable = details.retryable;
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
  private pendingJoins: Array<{
    conn: DataConnection;
    name: string;
    clientId?: string;
  }> = [];
  /** Host: clientId of the tab bound to each seat. */
  private seatClientId: Map<PlayerId, string> = new Map();
  private preGameConns: DataConnection[] = [];
  private currentLobbyState: LobbyData | null = null;
  private lastAdminSnapshot: GameState | null = null;
  private connToPid: WeakMap<DataConnection, PlayerId> = new WeakMap();
  private createPeer: () => Peer;
  private clientId: string | undefined;

  // Signaling (PeerJS server) reconnect — used by host and client.
  private signalingTimer: ReturnType<typeof setTimeout> | null = null;
  private signalingAttempt = 0;

  // Client auto-reconnect state.
  private session: { roomCode: string; name: string } | null = null;
  private connGeneration = 0;
  private reconnecting = false;
  private reconnectInFlight = false;
  private reconnectGaveUp = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectStartedAt = 0;

  // Liveness.
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeatTickAt = 0;
  private awaitingPongSince: number | null = null;
  /** Host has answered a ping on this connection (older hosts never do). */
  private hostPongSeen = false;
  /** Host: last time any message arrived on each client connection. */
  private clientLastSeen: Map<DataConnection, number> = new Map();
  /** Host: connections that heartbeat (and so are subject to timeouts). */
  private heartbeatConns: WeakSet<DataConnection> = new WeakSet();
  private resumeProbeTimer: ReturnType<typeof setTimeout> | null = null;
  /** Host: pending removals of closed lobby connections (grace period). */
  private lobbyLeaveTimers: Map<DataConnection, ReturnType<typeof setTimeout>> =
    new Map();

  private removeLifecycleListeners: (() => void) | null = null;

  constructor(
    callbacks: NetworkCallbacks,
    options: { createPeer?: () => Peer; clientId?: string } = {},
  ) {
    this.callbacks = callbacks;
    this.clientId = options.clientId;
    this.createPeer = options.createPeer ?? (() => new Peer());
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
      const peer = this.createPeer();
      this.peer = peer;
      let opened = false;

      peer.on("open", (id) => {
        this.signalingAttempt = 0;
        if (opened) {
          netLog("host re-registered with signaling server", id);
          this.callbacks.onConnectionStatusChange?.(
            "connected",
            "Room back online",
          );
          return;
        }
        opened = true;
        this.callbacks.onConnectionStatusChange?.("connected", "Hosting room");
        this.installLifecycleListeners();
        this.startHeartbeat();
        resolve(id as string);
      });
      peer.on("error", (err) => {
        const type = (err as { type?: string })?.type;
        if (!opened) {
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        // After the room exists, PeerJS errors used to vanish silently.
        console.warn("[catan-net] host peer error", type, err);
        if (type && SIGNALING_ERROR_TYPES.has(type)) {
          this.scheduleSignalingReconnect(peer);
        }
      });
      // The signaling websocket dropped (phone locked, app switched, network
      // blip). Existing data channels keep working, but the PeerJS server
      // forgets our id, so new joiners and rejoiners get "Room not found"
      // until we re-register with the same id.
      peer.on("disconnected", () => {
        if (this.destroyed || !opened) return;
        netLog("host lost signaling server");
        this.callbacks.onConnectionStatusChange?.(
          "reconnecting",
          "Room offline — reconnecting so players can join",
        );
        this.scheduleSignalingReconnect(peer);
      });

      peer.on("connection", (...args) => {
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

  /**
   * Re-register a disconnected peer with the signaling server (same id), with
   * backoff. Never tears down data channels.
   */
  private scheduleSignalingReconnect(peer: Peer, immediate = false) {
    if (this.destroyed || peer.destroyed) return;
    if (this.signalingTimer) {
      if (!immediate) return;
      clearTimeout(this.signalingTimer);
      this.signalingTimer = null;
    }
    const delay = immediate ? 0 : reconnectDelayMs(this.signalingAttempt);
    this.signalingTimer = setTimeout(() => {
      this.signalingTimer = null;
      if (this.destroyed || peer.destroyed || this.peer !== peer) return;
      if (!peer.disconnected) return;
      this.signalingAttempt++;
      netLog(`signaling reconnect attempt ${this.signalingAttempt}`);
      try {
        peer.reconnect();
      } catch (e) {
        console.warn("[catan-net] peer.reconnect failed", e);
      }
      // If reconnect() failed synchronously-ish, PeerJS emits error/disconnected
      // which re-enters here. Also re-check in case no event fires.
      if (peer.disconnected) {
        this.scheduleSignalingReconnect(peer);
      }
    }, delay);
  }

  initHostState(state: GameState) {
    this.state = state;
    // Process any joins that arrived before the game state was ready
    for (const { conn, name, clientId } of this.pendingJoins) {
      // A dead connection must not claim a seat (its owner may have
      // reconnected on a new one).
      if (conn.open === false) continue;
      const pid = this.findPendingSlot(name);
      if (!pid) {
        conn.send({ type: "error", msg: "No open slot" } satisfies NetMessage);
        continue;
      }
      this.bindPlayerConnection(conn, pid, clientId);
      this.callbacks.onPlayerJoined?.(name, pid);
      this.callbacks.onPlayerConnectionChange?.(
        pid,
        "connected",
        `${name} connected`,
      );
    }
    this.pendingJoins = [];
    this.preGameConns = [];
    for (const t of this.lobbyLeaveTimers.values()) clearTimeout(t);
    this.lobbyLeaveTimers.clear();
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
    this.clientLastSeen.set(conn, Date.now());
    // Only clients that heartbeat are subject to the host-side timeout, so an
    // older cached client build (no pings) is never kicked for being quiet.
    if (msg.type === "ping") this.heartbeatConns.add(conn);
    if (msg.type === "ping") {
      try {
        conn.send({ type: "pong" } satisfies NetMessage);
      } catch {
        this.handleHostConnectionClosed(conn, "Connection lost");
      }
      return;
    }
    if (msg.type === "join") {
      if (!this.state) {
        // Game not started yet — queue until initHostState is called.
        // A same-named pending join whose connection went quiet is this
        // client's previous (dead) connection: replace it, don't duplicate.
        // Same tab (clientId), or for older clients a same-named join, is a
        // reconnect of an existing lobby entry.
        const prior = this.pendingJoins.find(
          (j) =>
            j.conn !== conn &&
            (msg.clientId
              ? j.clientId === msg.clientId
              : !j.clientId && sameName(j.name, msg.name) && this.isHolderStale(j.conn)),
        );
        if (prior) {
          if (!this.isHolderStale(prior.conn)) {
            // Still live → a duplicated tab (copied sessionStorage). Don't
            // let the two fight; the real reconnect retries until quiet.
            conn.send({
              type: "error",
              msg: SEAT_IN_USE_MSG,
              retryable: true,
            } satisfies NetMessage);
            return;
          }
          // Swap in the new connection silently: same player, same name in
          // the lobby list, so no "left lobby" / "waiting to join" churn.
          this.clientLastSeen.delete(prior.conn);
          const graceTimer = this.lobbyLeaveTimers.get(prior.conn);
          if (graceTimer) clearTimeout(graceTimer);
          this.lobbyLeaveTimers.delete(prior.conn);
          this.pendingJoins = this.pendingJoins.filter((j) => j !== prior);
          this.preGameConns = this.preGameConns.filter((c) => c !== prior.conn);
          try {
            prior.conn.close();
          } catch {
            /* ignore */
          }
          this.pendingJoins.push({ conn, name: prior.name, clientId: msg.clientId });
          this.preGameConns.push(conn);
          if (this.currentLobbyState) {
            try {
              conn.send({ type: "lobby", ...this.currentLobbyState } satisfies NetMessage);
            } catch { /* ignore */ }
          }
          return;
        }
        this.pendingJoins.push({ conn, name: msg.name, clientId: msg.clientId });
        this.preGameConns.push(conn);
        if (this.currentLobbyState) {
          try {
            conn.send({ type: "lobby", ...this.currentLobbyState } satisfies NetMessage);
          } catch { /* ignore */ }
        }
        this.callbacks.onPendingJoin?.(msg.name);
        return;
      }

      // Reconnect: client sends their previous pid, or (if it lost its saved
      // pid, e.g. PWA relaunch) we match the seat by player name.
      const rejoin = this.resolveRejoin(msg);
      if (rejoin && "refuse" in rejoin) {
        conn.send({
          type: "error",
          msg: rejoin.refuse,
          retryable: true,
        } satisfies NetMessage);
        return;
      }
      const rejoinPid = rejoin?.pid;
      if (rejoinPid) {
        this.bindPlayerConnection(conn, rejoinPid, msg.clientId);
        this.callbacks.onPlayerJoined?.(msg.name, rejoinPid);
        this.callbacks.onPlayerConnectionChange?.(
          rejoinPid,
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
      this.bindPlayerConnection(conn, pid, msg.clientId);
      this.callbacks.onPlayerJoined?.(msg.name, pid);
      this.callbacks.onPlayerConnectionChange?.(
        pid,
        "connected",
        `${msg.name} connected`,
      );
      this.broadcastState();
    } else if (msg.type === "action") {
      const seat = this.connToPid.get(conn);
      const actor = actionActorPid(msg.action);
      if (!seat) {
        conn.send({
          type: "error",
          msg: "Not seated — rejoining",
          code: "not-seated",
        } satisfies NetMessage);
        return;
      }
      if (actor !== undefined && actor !== seat) {
        conn.send({ type: "error", msg: "That action isn't yours" } satisfies NetMessage);
        return;
      }
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

  private isRemoteHumanSeat(pid: PlayerId): boolean {
    const p = this.state?.players[pid];
    return !!p && !p.isBot && pid !== this.localPid;
  }

  /** True if `conn` hasn't been heard from recently (likely dead). */
  private isHolderStale(conn: DataConnection): boolean {
    const last = this.clientLastSeen.get(conn);
    return last === undefined || Date.now() - last > REJOIN_STALE_MS;
  }

  /**
   * Decide which seat a mid-game join reclaims. Returns a pid, a retryable
   * refusal (the seat is held and we can't prove the joiner owns it), or null
   * (not a rejoin — treat as a new join).
   *
   * Proof of ownership, strongest first:
   * 1. same clientId as the tab bound to the seat → take over once the old
   *    connection is closed or quiet (a live one is a duplicated tab);
   * 2. saved pid + matching name → take the seat if unheld or its holder is
   *    quiet; refuse (retry later) if the holder is live;
   * 3. name only → only an unheld seat; a held one waits for host timeout.
   */
  private resolveRejoin(
    msg: { name: string; pid?: PlayerId; clientId?: string },
  ): { pid: PlayerId } | { refuse: string } | null {
    if (!this.state) return null;

    if (msg.clientId) {
      for (const [pid, cid] of this.seatClientId) {
        if (cid !== msg.clientId || !this.isRemoteHumanSeat(pid)) continue;
        const holder = this.connections.get(pid);
        // A live holder with our clientId is a duplicated tab, not us.
        if (holder && !this.isHolderStale(holder)) {
          return { refuse: SEAT_IN_USE_MSG };
        }
        return { pid };
      }
    }

    if (
      msg.pid &&
      this.isRemoteHumanSeat(msg.pid) &&
      sameName(this.state.players[msg.pid]!.name, msg.name)
    ) {
      const holder = this.connections.get(msg.pid);
      if (!holder || this.isHolderStale(holder)) return { pid: msg.pid };
      return { refuse: SEAT_IN_USE_MSG };
    }

    const named = this.state.playerOrder.filter(
      (pid) =>
        this.isRemoteHumanSeat(pid) &&
        sameName(this.state!.players[pid]!.name, msg.name),
    );
    const free = named.find((pid) => !this.connections.has(pid));
    if (free) return { pid: free };
    if (named.length > 0) return { refuse: SEAT_IN_USE_MSG };
    return null;
  }

  /** Map `conn` to `pid`, closing any previous connection for that seat. */
  private bindPlayerConnection(
    conn: DataConnection,
    pid: PlayerId,
    clientId?: string,
  ) {
    if (clientId) this.seatClientId.set(pid, clientId);
    else this.seatClientId.delete(pid);
    const previous = this.connections.get(pid);
    if (previous && previous !== conn) {
      this.clientLastSeen.delete(previous);
      try {
        previous.close?.();
      } catch {
        /* ignore stale close errors */
      }
    }
    this.connections.set(pid, conn);
    this.connToPid.set(conn, pid);
    conn.send({
      type: "welcome",
      pid,
      state: this.state!,
    } satisfies NetMessage);
  }

  private handleHostConnectionClosed(conn: DataConnection, detail: string) {
    this.clientLastSeen.delete(conn);
    const pid = this.connToPid.get(conn);
    if (!pid) {
      const pending = this.pendingJoins.find((j) => j.conn === conn);
      // Tabs that identify themselves get a grace period to come back.
      if (pending?.clientId && detail !== "Timed out" && !this.destroyed) {
        if (!this.lobbyLeaveTimers.has(conn)) {
          this.lobbyLeaveTimers.set(
            conn,
            setTimeout(() => {
              this.lobbyLeaveTimers.delete(conn);
              this.removePreGameConnection(conn, detail);
            }, LOBBY_LEAVE_GRACE_MS),
          );
        }
        return;
      }
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

  private findPendingSlot(name: string): PlayerId | null {
    if (!this.state) return null;
    // Free remote human seats. Prefer the one named after the joiner: with a
    // random board, playerOrder is shuffled, so "first free" mislabels seats.
    const free = this.state.playerOrder.filter(
      (pid) => this.isRemoteHumanSeat(pid) && !this.connections.has(pid),
    );
    return (
      free.find((pid) => sameName(this.state!.players[pid]!.name, name)) ??
      free[0] ??
      null
    );
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

  /**
   * Join a room. Resolves once the host sends lobby or game state; rejects
   * with a `JoinFailure` otherwise. After the first success the client keeps
   * itself connected: dropped channels are detected (close events + ping
   * heartbeat) and re-joined automatically with the same pid.
   */
  async joinGame(
    roomCode: string,
    playerName: string,
    existingPid?: PlayerId,
  ): Promise<void> {
    this.isHost = false;
    this.session = { roomCode, name: playerName };
    if (existingPid) this.localPid = existingPid;
    // After a reload the host may still hold our seat on the old (dead)
    // connection until it times out; it says so with a retryable refusal.
    for (let attempt = 0; ; attempt++) {
      const quiet = attempt < JOIN_SEAT_IN_USE_RETRIES;
      try {
        await this.connectToHost("join", quiet);
        break;
      } catch (e) {
        if (!quiet || this.destroyed || !isJoinFailureError(e) || !e.retryable) {
          throw e;
        }
        await new Promise((r) => setTimeout(r, reconnectDelayMs(attempt)));
        if (this.destroyed) throw e;
      }
    }
    this.installLifecycleListeners();
  }

  private connectToHost(
    mode: "join" | "reconnect",
    quietRetryable = false,
  ): Promise<void> {
    const { roomCode, name: playerName } = this.session!;
    const gen = ++this.connGeneration;
    const isCurrent = () => gen === this.connGeneration && !this.destroyed;
    const startedAt = getMonotonicNow();
    if (mode === "join") {
      this.callbacks.onConnectionStatusChange?.(
        "connecting",
        "Connecting to host",
      );
    }
    this.emitJoinDiagnostic({
      stage: "peer-open",
      status: "info",
      message:
        mode === "join"
          ? "Opening PeerJS connection"
          : `Reconnect attempt ${this.reconnectAttempt}`,
      source: mode === "join" ? "peer.new" : "reconnect",
      roomCode,
      elapsedMs: 0,
    });
    return new Promise((resolve, reject) => {
      let settled = false;
      let rejecting = false;
      let activeStage: JoinDiagnosticStage = "peer-open";
      let stageTimer: ReturnType<typeof setTimeout> | null = null;
      let conn: DataConnection | null = null;
      const peer = this.createPeer();
      this.peer = peer;
      const elapsedMs = () => Math.round(getMonotonicNow() - startedAt);
      const clearStageTimer = () => {
        if (stageTimer) clearTimeout(stageTimer);
        stageTimer = null;
      };
      const fail = (failure: JoinFailure) => {
        if (settled) return;
        // Abandoned attempt (destroyed / superseded): never report into the
        // store — it would clobber the status of whatever replaced it.
        if (!isCurrent()) {
          safeReject(failure);
          return;
        }
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
        if (mode === "join" && failure.retryable && quietRetryable) {
          this.callbacks.onConnectionStatusChange?.(
            "connecting",
            "Waiting for your previous connection to close…",
          );
        } else if (mode === "join") {
          this.callbacks.onJoinFailure?.(failure);
          this.callbacks.onConnectionStatusChange?.(
            "disconnected",
            failure.message,
          );
        } else {
          netLog("reconnect attempt failed:", failure.message, failure.errorType ?? "");
        }
        safeReject(failure);
      };
      const startStageTimeout = (stage: JoinDiagnosticStage) => {
        clearStageTimer();
        activeStage = stage;
        stageTimer = setTimeout(() => {
          fail(
            createJoinTimeoutFailure(stage, {
              roomCode,
              peerId: peer.id ?? undefined,
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
          peer.destroy();
        } catch {
          /* ignore destroy failures during cleanup */
        }
        if (this.peer === peer) this.peer = null;
        if (this.connections.get("host") === conn) this.connections.delete("host");
        reject(err);
      };
      /** After a successful join, any loss hands off to auto-reconnect. */
      const lost = (reason: string) => {
        if (rejecting || !isCurrent()) return;
        if (!settled) {
          fail(
            new CatanJoinFailure({
              stage: activeStage,
              message: reason,
              hint: "The connection closed before the host answered. Try again.",
              source: "conn.close",
              roomCode,
              peerId: peer.id ?? undefined,
              elapsedMs: elapsedMs(),
            }),
          );
          return;
        }
        this.emitJoinDiagnostic({
          stage: activeStage,
          status: "error",
          message: reason,
          source: "connection-lost",
          roomCode,
          peerId: peer.id ?? undefined,
          elapsedMs: elapsedMs(),
        });
        this.handleHostLost(reason);
      };

      startStageTimeout("peer-open");
      peer.on("error", (err) => {
        if (!settled) {
          fail(
            createJoinFailureFromError(activeStage, err, {
              roomCode,
              peerId: peer.id ?? undefined,
              elapsedMs: elapsedMs(),
              source: "peer.error",
            }),
          );
          return;
        }
        const type = (err as { type?: string })?.type;
        console.warn("[catan-net] client peer error", type, err);
        if (isCurrent() && type && SIGNALING_ERROR_TYPES.has(type)) {
          this.scheduleSignalingReconnect(peer);
        }
      });
      peer.on("disconnected", () => {
        if (!isCurrent()) return;
        this.emitJoinDiagnostic({
          stage: activeStage,
          status: "info",
          message: "Peer disconnected from signaling server",
          source: "peer.disconnected",
          roomCode,
          elapsedMs: elapsedMs(),
        });
        // Once joined, signaling isn't needed for the data channel — quietly
        // re-register; the heartbeat decides whether the host is reachable.
        if (settled) this.scheduleSignalingReconnect(peer);
      });
      peer.on("close", () => lost("Peer closed"));
      peer.on("open", () => {
        if (!isCurrent()) return;
        if (conn) {
          // Re-open after a signaling reconnect: reset its backoff.
          this.signalingAttempt = 0;
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
            lost(e.message || "Host connection error");
          }
        });
        hostConn.on("close", () => lost("Lost connection to host"));
        hostConn.on("open", () => {
          if (!isCurrent()) return;
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
          if (mode === "join") {
            this.callbacks.onConnectionStatusChange?.(
              "connecting",
              "Connected to room, waiting for host state",
            );
          }
          const joinMsg: NetMessage = { type: "join", name: playerName };
          if (this.localPid) joinMsg.pid = this.localPid;
          if (this.clientId) joinMsg.clientId = this.clientId;
          hostConn.send(joinMsg);
          const markJoined = (source: string, message: string) => {
            this.emitJoinDiagnostic({
              stage: "host-state",
              status: "success",
              message,
              source,
              roomCode,
              peerId: peer.id,
              elapsedMs: elapsedMs(),
            });
            const wasReconnect = mode === "reconnect" && !settled;
            this.onClientJoined();
            this.callbacks.onConnectionStatusChange?.(
              "connected",
              wasReconnect ? "Reconnected to host" : "Connected to host",
            );
            safeResolve();
          };
          hostConn.on("data", (msg) => {
            if (!isCurrent()) return;
            this.awaitingPongSince = null;
            const m = msg as NetMessage;
            if (m.type === "pong") {
              this.hostPongSeen = true;
              return;
            }
            if (m.type === "welcome") {
              this.localPid = m.pid;
              this.state = m.state;
              this.callbacks.onStateUpdate(m.state);
              markJoined("message.welcome", "Received game state from host");
            } else if (m.type === "lobby") {
              const { hostName, pendingNames, bots } = m;
              this.callbacks.onLobbyUpdate?.({ hostName, pendingNames, bots });
              markJoined("message.lobby", "Received lobby state from host");
            } else if (m.type === "state") {
              this.state = m.state;
              this.callbacks.onStateUpdate(m.state);
            } else if (m.type === "error") {
              if (settled && m.code === "not-seated") {
                this.handleHostLost("Host lost track of this seat");
                return;
              } else if (settled) {
                this.callbacks.onError(m.msg);
              } else if (m.retryable) {
                // Seat still held by our old connection: retried quietly.
              } else if (mode === "join") {
                this.callbacks.onError(m.msg);
              } else {
                // Host refused the seat outright: retrying won't help, so
                // stop (one toast) instead of repeating it every attempt.
                this.callbacks.onError(m.msg);
                this.reconnectAttempt = CLIENT_MAX_RECONNECT_ATTEMPTS;
              }
              if (!settled) {
                fail(
                  new CatanJoinFailure({
                    stage: activeStage,
                    message: m.msg,
                    hint: m.retryable
                      ? "This seat is still connected on another tab or device. If that was you, close it or wait a few seconds and try again."
                      : "The host rejected the join request. Check available lobby slots and try again.",
                    source: "message.error",
                    retryable: m.retryable,
                    roomCode,
                    peerId: peer.id,
                    elapsedMs: elapsedMs(),
                  }),
                );
              }
            }
          });
          this.connections.set("host", hostConn);
        });
      });
    });
  }

  private onClientJoined() {
    this.reconnecting = false;
    this.reconnectGaveUp = false;
    this.reconnectAttempt = 0;
    this.startHeartbeat();
  }

  /** The host link is gone (or presumed dead). Tear down and start retrying. */
  private handleHostLost(reason: string) {
    if (this.isHost || this.destroyed || !this.session || this.reconnecting) {
      return;
    }
    netLog("host connection lost:", reason);
    this.reconnecting = true;
    this.reconnectGaveUp = false;
    this.reconnectStartedAt = Date.now();
    this.teardownClientPeer();
    this.callbacks.onConnectionStatusChange?.(
      "reconnecting",
      `${reason} — reconnecting…`,
    );
    this.scheduleClientReconnect();
  }

  private teardownClientPeer() {
    this.connGeneration++; // ignore late events from the old peer/conn
    this.stopHeartbeat();
    // The old peer's signaling retry must not block the next peer's.
    if (this.signalingTimer) clearTimeout(this.signalingTimer);
    this.signalingTimer = null;
    this.signalingAttempt = 0;
    const conn = this.connections.get("host");
    this.connections.delete("host");
    try {
      conn?.close();
    } catch {
      /* ignore */
    }
    try {
      this.peer?.destroy();
    } catch {
      /* ignore */
    }
    this.peer = null;
  }

  private scheduleClientReconnect(delayOverride?: number) {
    if (this.destroyed || this.reconnectInFlight) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (
      this.reconnectAttempt >= CLIENT_MAX_RECONNECT_ATTEMPTS ||
      Date.now() - this.reconnectStartedAt > CLIENT_RECONNECT_BUDGET_MS
    ) {
      this.reconnecting = false;
      this.reconnectGaveUp = true;
      netLog("giving up reconnect after", this.reconnectAttempt, "attempts");
      this.callbacks.onConnectionStatusChange?.(
        "disconnected",
        "Could not reconnect to host",
      );
      return;
    }
    const delay = delayOverride ?? reconnectDelayMs(this.reconnectAttempt);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.destroyed) return;
      this.reconnectAttempt++;
      this.reconnectInFlight = true;
      this.connectToHost("reconnect").then(
        () => {
          this.reconnectInFlight = false;
        },
        () => {
          this.reconnectInFlight = false;
          if (!this.destroyed && this.reconnecting) this.scheduleClientReconnect();
        },
      );
    }, delay);
  }

  /**
   * Manual "Reconnect" (client) or "bring room back online now" (host).
   * Also used when the page becomes visible again.
   */
  retryConnection() {
    if (this.destroyed) return;
    if (this.isHost) {
      if (this.peer?.disconnected) this.scheduleSignalingReconnect(this.peer, true);
      return;
    }
    if (!this.session || this.reconnectInFlight) return;
    this.teardownClientPeer();
    this.reconnecting = true;
    this.reconnectGaveUp = false;
    this.reconnectAttempt = 0;
    this.reconnectStartedAt = Date.now();
    this.callbacks.onConnectionStatusChange?.("reconnecting", "Reconnecting…");
    this.scheduleClientReconnect(0);
  }

  // ─── Liveness ──────────────────────────────────────────────────────────────

  private startHeartbeat() {
    this.stopHeartbeat();
    this.awaitingPongSince = null;
    this.hostPongSeen = false;
    this.lastHeartbeatTickAt = Date.now();
    this.heartbeatTimer = setInterval(
      () => this.heartbeatTick(),
      HEARTBEAT_INTERVAL_MS,
    );
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (this.resumeProbeTimer) clearTimeout(this.resumeProbeTimer);
    this.resumeProbeTimer = null;
    this.awaitingPongSince = null;
  }

  private heartbeatTick(timeoutMs = HEARTBEAT_TIMEOUT_MS) {
    if (this.destroyed) return;
    const now = Date.now();
    // A late tick means the page was frozen/throttled (background tab, locked
    // phone). Nothing was processed meanwhile, so silence proves nothing:
    // reset the clocks and probe afresh instead of declaring anything dead.
    const resumed = now - this.lastHeartbeatTickAt > HEARTBEAT_INTERVAL_MS * 3;
    this.lastHeartbeatTickAt = now;

    if (this.isHost) {
      if (resumed) {
        for (const conn of this.clientLastSeen.keys()) this.clientLastSeen.set(conn, now);
        return;
      }
      for (const [conn, seen] of this.clientLastSeen) {
        if (!this.heartbeatConns.has(conn)) continue;
        if (now - seen <= HOST_CLIENT_TIMEOUT_MS) continue;
        netLog("client timed out", this.connToPid.get(conn) ?? "(lobby)");
        try {
          conn.close();
        } catch {
          /* ignore */
        }
        this.handleHostConnectionClosed(conn, "Timed out");
      }
      return;
    }

    const conn = this.connections.get("host");
    if (!conn || this.reconnecting) return;
    // Only hold the host to the pong deadline once it has shown it answers
    // pings; a host on an older cached build never will.
    if (resumed || !this.hostPongSeen) this.awaitingPongSince = null;
    if (this.awaitingPongSince !== null) {
      if (now - this.awaitingPongSince > timeoutMs) {
        this.handleHostLost("Host stopped responding");
      }
      return;
    }
    if (!conn.open) {
      this.handleHostLost("Connection to host closed");
      return;
    }
    try {
      conn.send({ type: "ping" } satisfies NetMessage);
      this.awaitingPongSince = now;
    } catch {
      this.handleHostLost("Lost connection to host");
    }
  }

  /** Page came back to the foreground / network came back. */
  private handleResume() {
    if (this.destroyed) return;
    netLog("page resumed");
    if (this.isHost) {
      this.heartbeatTick(); // resets client clocks after a freeze
      this.retryConnection();
      return;
    }
    if (this.reconnectGaveUp) {
      this.retryConnection();
      return;
    }
    if (this.reconnecting) {
      // Skip the remaining backoff — try right away.
      if (this.reconnectTimer && !this.reconnectInFlight) this.scheduleClientReconnect(0);
      return;
    }
    if (!this.connections.get("host")) return;
    // Quick probe: ping now, and if no reply within a few seconds, reconnect.
    this.awaitingPongSince = null;
    this.lastHeartbeatTickAt = Date.now();
    this.heartbeatTick();
    if (this.resumeProbeTimer) clearTimeout(this.resumeProbeTimer);
    const gen = this.connGeneration;
    this.resumeProbeTimer = setTimeout(() => {
      this.resumeProbeTimer = null;
      if (gen !== this.connGeneration) return; // connection replaced meanwhile
      this.lastHeartbeatTickAt = Date.now();
      this.heartbeatTick(RESUME_PROBE_TIMEOUT_MS - 100);
    }, RESUME_PROBE_TIMEOUT_MS);
  }

  private installLifecycleListeners() {
    if (this.removeLifecycleListeners) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") this.handleResume();
    };
    const onResume = () => this.handleResume();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onResume);
    window.addEventListener("pageshow", onResume);
    this.removeLifecycleListeners = () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onResume);
      window.removeEventListener("pageshow", onResume);
    };
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
        if (this.reconnecting) {
          this.callbacks.onError("Reconnecting to host — try again in a moment");
          return;
        }
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
        this.callbacks.onError("Action not sent — reconnecting to host");
        this.handleHostLost("Failed to send action to host");
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
    if (this.signalingTimer) clearTimeout(this.signalingTimer);
    this.signalingTimer = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopHeartbeat();
    for (const t of this.lobbyLeaveTimers.values()) clearTimeout(t);
    this.lobbyLeaveTimers.clear();
    this.removeLifecycleListeners?.();
    this.removeLifecycleListeners = null;
    this.connGeneration++;
    this.peer?.destroy();
    this.peer = null;
    this.connections.clear();
  }
}
