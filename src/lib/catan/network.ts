/**
 * network.ts — PeerJS wrapper for Catan C&K multiplayer
 *
 * Host creates a room (peer.id = room code), validates actions, broadcasts state.
 * Clients connect to host's peer.id, send actions, receive state updates.
 * Bot turns run only on the host after every state update.
 */
import {
  type GameState,
  type GameAction,
  type PlayerId,
  isAdminAction,
} from "./types.js";
import { applyAction } from "./game.js";
import { chooseBotAction } from "./ai.js";
import { getActingPlayerIds } from "./turnActors.js";

// ─── PeerJS Interface Definitions ──────────────────────────────────────────────

interface DataConnection {
  on(event: string, callback: (...args: unknown[]) => void): void;
  send(data: unknown): void;
  close(): void;
}

interface PeerInstance {
  id: string;
  on(event: "open", callback: (id: string) => void): void;
  on(event: "error", callback: (err: Error) => void): void;
  on(event: "connection", callback: (conn: DataConnection) => void): void;
  connect(peerId: string): DataConnection;
  destroy(): void;
}

interface PeerConstructor {
  new (): PeerInstance;
}

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
  onReady?(): void;
}

// ─── Network Manager ──────────────────────────────────────────────────────────

export class CatanNetwork {
  private peer: PeerInstance | null = null;
  private connections: Map<PlayerId, DataConnection> = new Map();
  private isHost = false;
  private localPid: PlayerId | null = null;
  private state: GameState | null = null;
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

    const Peer = await loadPeer();
    return new Promise((resolve, reject) => {
      this.peer = new Peer();

      this.peer.on("open", (id: string) => {
        this.callbacks.onConnectionStatusChange?.("connected", "Hosting room");
        resolve(id);
      });
      this.peer.on("error", (err: Error) => reject(err));

      this.peer.on("connection", (conn: DataConnection) => {
        conn.on("open", () => {
          conn.on("data", (msg: NetMessage) =>
            this.handleHostMessage(conn, msg),
          );
        });
        conn.on("close", () => {
          this.handleHostConnectionClosed(conn, "Connection closed");
        });
        conn.on("error", (e: Error) => {
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
        conn.on("close", () => {
          const idx = this.preGameConns.indexOf(conn);
          if (idx !== -1) this.preGameConns.splice(idx, 1);
        });
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
    if (!pid) return;
    this.connToPid.delete(conn);
    const mapped = this.connections.get(pid);
    if (mapped === conn) {
      this.connections.delete(pid);
      this.callbacks.onPlayerConnectionChange?.(pid, "disconnected", detail);
    }
  }

  private findPendingSlot(name: string): PlayerId | null {
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

  private runBotTurns() {
    if (!this.state) return;
    let guard = 0;
    while (this.state.phase !== "GAME_OVER" && guard++ < 200) {
      const queuedBotPid = this.findQueuedBotPid();
      if (queuedBotPid) {
        const action = chooseBotAction(this.state, queuedBotPid);
        this.state = applyAction(this.state, action);
        continue;
      }

      if (
        this.state.phase === "RESOLVE_PROGRESS_DRAW" ||
        this.state.phase === "DISCARD" ||
        this.state.phase === "KNIGHT_DISPLACE_RESPONSE"
      ) {
        break;
      }

      if (!this.state.players[this.state.currentPlayerId]?.isBot) break;
      const action = chooseBotAction(this.state, this.state.currentPlayerId);
      this.state = applyAction(this.state, action);
    }
    if (guard > 0) {
      this.callbacks.onStateUpdate(this.state);
      this.broadcastState();
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

  // ─── Client ────────────────────────────────────────────────────────────────

  async joinGame(
    roomCode: string,
    playerName: string,
    existingPid?: PlayerId,
  ): Promise<void> {
    this.isHost = false;
    this.callbacks.onConnectionStatusChange?.(
      "connecting",
      "Connecting to host",
    );
    const Peer = await loadPeer();
    return new Promise((resolve, reject) => {
      let settled = false;
      const safeResolve = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const safeReject = (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      };

      this.peer = new Peer();
      this.peer.on("error", (err: Error) => {
        this.callbacks.onConnectionStatusChange?.(
          "disconnected",
          err?.message ?? "Peer error",
        );
        if (!settled) safeReject(err);
      });
      this.peer.on("disconnected", () => {
        this.callbacks.onConnectionStatusChange?.(
          "reconnecting",
          "Peer disconnected, attempting reconnect",
        );
      });
      this.peer.on("close", () => {
        this.callbacks.onConnectionStatusChange?.(
          "disconnected",
          "Peer closed",
        );
      });
      this.peer.on("open", () => {
        const conn = this.peer.connect(roomCode);
        conn.on("open", () => {
          this.callbacks.onConnectionStatusChange?.(
            "connecting",
            "Connected to room, waiting for host state",
          );
          const joinMsg: NetMessage = existingPid
            ? { type: "join", name: playerName, pid: existingPid }
            : { type: "join", name: playerName };
          conn.send(joinMsg);
          conn.on("data", (msg: NetMessage) => {
            if (msg.type === "welcome") {
              this.localPid = msg.pid;
              this.state = msg.state;
              this.callbacks.onStateUpdate(msg.state);
              this.callbacks.onConnectionStatusChange?.(
                "connected",
                "Connected to host",
              );
              safeResolve();
            } else if (msg.type === "lobby") {
              const { hostName, pendingNames, bots } = msg;
              this.callbacks.onLobbyUpdate?.({ hostName, pendingNames, bots });
              this.callbacks.onConnectionStatusChange?.(
                "connected",
                "Connected to host",
              );
              safeResolve();
            } else if (msg.type === "state") {
              this.state = msg.state;
              this.callbacks.onStateUpdate(msg.state);
            } else if (msg.type === "error") {
              this.callbacks.onError(msg.msg);
              this.callbacks.onConnectionStatusChange?.(
                "disconnected",
                msg.msg,
              );
              if (!settled) safeReject(new Error(msg.msg));
            }
          });
          conn.on("close", () => {
            this.callbacks.onConnectionStatusChange?.(
              "disconnected",
              "Lost connection to host",
            );
          });
          conn.on("error", (err: Error) => {
            this.callbacks.onConnectionStatusChange?.(
              "disconnected",
              err?.message ?? "Host connection error",
            );
          });
          this.connections.set("host", conn);
        });
        conn.on("error", (err: Error) => {
          this.callbacks.onConnectionStatusChange?.(
            "disconnected",
            err?.message ?? "Failed to connect to host",
          );
          if (!settled) safeReject(err);
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
    this.peer?.destroy();
    this.peer = null;
    this.connections.clear();
  }
}

// ─── PeerJS Loader ────────────────────────────────────────────────────────────

let PeerClass: PeerConstructor | null = null;

async function loadPeer(): Promise<PeerConstructor> {
  if (PeerClass) return PeerClass;
  // In browser: load from CDN via script tag if not already loaded
  if (typeof window !== "undefined") {
    if ((window as any).Peer) {
      PeerClass = (window as any).Peer;
      return PeerClass;
    }
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js";
      s.onload = () => {
        PeerClass = (window as any).Peer;
        resolve();
      };
      s.onerror = () => reject(new Error("Failed to load PeerJS"));
      document.head.appendChild(s);
    });
  }
  return PeerClass;
}
