/**
 * network.ts — PeerJS wrapper for Catan C&K multiplayer
 *
 * Host creates a room (peer.id = room code), validates actions, broadcasts state.
 * Clients connect to host's peer.id, send actions, receive state updates.
 * Bot turns run only on the host after every state update.
 */

import type { GameState, GameAction, PlayerId } from './types.js';
import { applyAction } from './game.js';
import { chooseBotAction } from './ai.js';

// ─── Message Protocol ─────────────────────────────────────────────────────────

export type NetMessage =
  | { type: 'join';    name: string; pid?: PlayerId }  // pid present on reconnect
  | { type: 'welcome'; pid: PlayerId; state: GameState }
  | { type: 'action';  action: GameAction }
  | { type: 'state';   state: GameState }
  | { type: 'error';   msg: string };

// ─── Callbacks ────────────────────────────────────────────────────────────────

export interface NetworkCallbacks {
  onStateUpdate(state: GameState): void;
  onError(msg: string): void;
  onPlayerJoined?(name: string, pid: PlayerId): void;
  onPendingJoin?(name: string): void;
  onReady?(): void;
}

// ─── Network Manager ──────────────────────────────────────────────────────────

export class CatanNetwork {
  private peer: any = null;
  private connections: Map<PlayerId, any> = new Map();
  private isHost = false;
  private localPid: PlayerId | null = null;
  private state: GameState | null = null;
  private callbacks: NetworkCallbacks;
  private pendingJoins: Array<{ conn: any; name: string }> = [];

  constructor(callbacks: NetworkCallbacks) {
    this.callbacks = callbacks;
  }

  // ─── Host ──────────────────────────────────────────────────────────────────

  /**
   * Creates a new PeerJS peer. Returns the room code (= peer.id).
   * The host must call `initHost(initialState)` once the game starts.
   */
  async hostGame(hostPid: PlayerId): Promise<string> {
    this.isHost = true;
    this.localPid = hostPid;

    const Peer = await loadPeer();
    return new Promise((resolve, reject) => {
      this.peer = new Peer();

      this.peer.on('open', (id: string) => resolve(id));
      this.peer.on('error', (err: any) => reject(err));

      this.peer.on('connection', (conn: any) => {
        conn.on('open', () => {
          conn.on('data', (msg: NetMessage) => this.handleHostMessage(conn, msg));
        });
        conn.on('error', (e: any) => console.warn('[host] conn error', e));
      });
    });
  }

  initHostState(state: GameState) {
    this.state = state;
    // Process any joins that arrived before the game state was ready
    for (const { conn, name } of this.pendingJoins) {
      const pid = this.findPendingSlot(name);
      if (!pid) {
        conn.send({ type: 'error', msg: 'No open slot' } satisfies NetMessage);
        continue;
      }
      this.connections.set(pid, conn);
      conn.send({ type: 'welcome', pid, state: this.state } satisfies NetMessage);
      this.callbacks.onPlayerJoined?.(name, pid);
    }
    this.pendingJoins = [];
    if (this.connections.size > 0) this.broadcastState();
    this.runBotTurns();
  }

  updateCallbacks(callbacks: Partial<NetworkCallbacks>) {
    Object.assign(this.callbacks, callbacks);
  }

  private handleHostMessage(conn: any, msg: NetMessage) {
    if (msg.type === 'join') {
      if (!this.state) {
        // Game not started yet — queue until initHostState is called
        this.pendingJoins.push({ conn, name: msg.name });
        this.callbacks.onPendingJoin?.(msg.name);
        return;
      }

      // Reconnect: client sends their previous pid
      if (msg.pid && this.state.players[msg.pid] && !this.state.players[msg.pid]!.isBot) {
        this.connections.set(msg.pid, conn);
        conn.send({ type: 'welcome', pid: msg.pid, state: this.state } satisfies NetMessage);
        this.callbacks.onPlayerJoined?.(msg.name, msg.pid);
        return;
      }

      // New join: find a waiting human slot
      const pid = this.findPendingSlot(msg.name);
      if (!pid) {
        conn.send({ type: 'error', msg: 'No open slot' } satisfies NetMessage);
        return;
      }
      this.connections.set(pid, conn);
      conn.send({ type: 'welcome', pid, state: this.state } satisfies NetMessage);
      this.callbacks.onPlayerJoined?.(msg.name, pid);
      this.broadcastState();
    } else if (msg.type === 'action') {
      this.applyAndBroadcast(msg.action);
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
      this.callbacks.onError('Game not initialized');
      return;
    }
    try {
      this.state = applyAction(this.state, action);
      this.callbacks.onStateUpdate(this.state);
      this.broadcastState();
      this.runBotTurns();
    } catch (e: any) {
      const msg = e?.message ?? 'Invalid action';
      console.error('[catan] applyAction failed:', msg, action);
      // Show error to host directly
      this.callbacks.onError(msg);
      // Also forward to remote sender if applicable
      const pid = (action as any).pid as PlayerId | undefined;
      if (pid && this.connections.has(pid)) {
        this.connections.get(pid)!.send({ type: 'error', msg } satisfies NetMessage);
      }
    }
  }

  private runBotTurns() {
    if (!this.state) return;
    let guard = 0;
    while (
      this.state.phase !== 'GAME_OVER' &&
      this.state.players[this.state.currentPlayerId]?.isBot &&
      guard++ < 200
    ) {
      const action = chooseBotAction(this.state, this.state.currentPlayerId);
      this.state = applyAction(this.state, action);
    }
    if (guard > 0) {
      this.callbacks.onStateUpdate(this.state);
      this.broadcastState();
    }
  }

  broadcastState() {
    if (!this.state) return;
    const msg: NetMessage = { type: 'state', state: this.state };
    for (const conn of this.connections.values()) {
      try { conn.send(msg); } catch { /* stale connection */ }
    }
  }

  // ─── Client ────────────────────────────────────────────────────────────────

  async joinGame(roomCode: string, playerName: string, existingPid?: PlayerId): Promise<void> {
    this.isHost = false;
    const Peer = await loadPeer();
    return new Promise((resolve, reject) => {
      this.peer = new Peer();
      this.peer.on('error', reject);
      this.peer.on('open', () => {
        const conn = this.peer.connect(roomCode);
        conn.on('open', () => {
          const joinMsg: NetMessage = existingPid
            ? { type: 'join', name: playerName, pid: existingPid }
            : { type: 'join', name: playerName };
          conn.send(joinMsg);
          conn.on('data', (msg: NetMessage) => {
            if (msg.type === 'welcome') {
              this.localPid = msg.pid;
              this.state = msg.state;
              this.callbacks.onStateUpdate(msg.state);
              resolve();
            } else if (msg.type === 'state') {
              this.state = msg.state;
              this.callbacks.onStateUpdate(msg.state);
            } else if (msg.type === 'error') {
              this.callbacks.onError(msg.msg);
              reject(new Error(msg.msg));
            }
          });
          this.connections.set('host', conn);
        });
        conn.on('error', reject);
      });
    });
  }

  // ─── Shared ────────────────────────────────────────────────────────────────

  sendAction(action: GameAction) {
    if (this.isHost) {
      this.applyAndBroadcast(action);
    } else {
      this.connections.get('host')?.send({ type: 'action', action } satisfies NetMessage);
    }
  }

  get myPid(): PlayerId | null { return this.localPid; }
  get currentState(): GameState | null { return this.state; }

  destroy() {
    this.peer?.destroy();
    this.peer = null;
    this.connections.clear();
  }
}

// ─── PeerJS Loader ────────────────────────────────────────────────────────────

let PeerClass: any = null;

async function loadPeer(): Promise<any> {
  if (PeerClass) return PeerClass;
  // In browser: load from CDN via script tag if not already loaded
  if (typeof window !== 'undefined') {
    if ((window as any).Peer) {
      PeerClass = (window as any).Peer;
      return PeerClass;
    }
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
      s.onload = () => { PeerClass = (window as any).Peer; resolve(); };
      s.onerror = () => reject(new Error('Failed to load PeerJS'));
      document.head.appendChild(s);
    });
  }
  return PeerClass;
}
