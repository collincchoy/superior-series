import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../../lib/catan/game.js";
import { CatanNetwork, type NetMessage } from "../../lib/catan/network.js";

// ─── Fake PeerJS ──────────────────────────────────────────────────────────────

type Handler = (...args: any[]) => void;

class Emitter {
  handlers = new Map<string, Handler[]>();
  on(ev: string, fn: Handler) {
    this.handlers.set(ev, [...(this.handlers.get(ev) ?? []), fn]);
    return this;
  }
  emit(ev: string, ...args: unknown[]) {
    for (const fn of this.handlers.get(ev) ?? []) fn(...args);
  }
}

class FakeConn extends Emitter {
  open = false;
  sent: NetMessage[] = [];
  closed = false;
  failSend = false;
  constructor(public peer: string) {
    super();
  }
  send(msg: NetMessage) {
    if (this.failSend) throw new Error("channel closed");
    this.sent.push(msg);
  }
  close() {
    this.closed = true;
  }
  /** Simulate the data channel opening. */
  doOpen() {
    this.open = true;
    this.emit("open");
  }
  receive(msg: NetMessage) {
    this.emit("data", msg);
  }
}

class FakePeer extends Emitter {
  id: string | null = null;
  disconnected = false;
  destroyed = false;
  conns: FakeConn[] = [];
  reconnect = vi.fn(() => {
    this.disconnected = false;
  });
  connect(code: string) {
    const c = new FakeConn(code);
    this.conns.push(c);
    return c;
  }
  destroy() {
    this.destroyed = true;
  }
  doOpen(id: string) {
    this.id = id;
    this.disconnected = false;
    this.emit("open", id);
  }
  dropSignaling() {
    this.disconnected = true;
    this.id = null;
    this.emit("disconnected");
  }
}

function makeNetwork(callbacks: Partial<ConstructorParameters<typeof CatanNetwork>[0]> = {}) {
  const peers: FakePeer[] = [];
  const status = vi.fn();
  const net = new CatanNetwork(
    {
      onStateUpdate: vi.fn(),
      onError: vi.fn(),
      onConnectionStatusChange: status,
      ...callbacks,
    },
    {
      createPeer: () => {
        const p = new FakePeer();
        peers.push(p);
        return p as any;
      },
    },
  );
  return { net, peers, status };
}

function twoHumanState() {
  return createInitialState([
    { id: "player1", name: "Host", color: "#e74c3c", isBot: false },
    { id: "player2", name: "Guest", color: "#3498db", isBot: false },
    { id: "player3", name: "Bot 3", color: "#2ecc71", isBot: true },
  ]);
}

/** Drive a client through a successful initial join. */
async function joinedClient() {
  const ctx = makeNetwork();
  const joined = ctx.net.joinGame("room-1", "Guest");
  const peer = ctx.peers[0]!;
  peer.doOpen("client-a");
  const conn = peer.conns[0]!;
  conn.doOpen();
  conn.receive({ type: "welcome", pid: "player2", state: twoHumanState() });
  await joined;
  return { ...ctx, peer, conn };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

// ─── Host ─────────────────────────────────────────────────────────────────────

describe("host signaling reconnect", () => {
  it("reconnects to the signaling server when the host peer is disconnected", async () => {
    const { net, peers, status } = makeNetwork();
    const hosting = net.hostGame("player1");
    peers[0]!.doOpen("room-1");
    await hosting;

    peers[0]!.dropSignaling();
    expect(status).toHaveBeenLastCalledWith("reconnecting", expect.any(String));
    await vi.advanceTimersByTimeAsync(1000);
    expect(peers[0]!.reconnect).toHaveBeenCalledTimes(1);

    peers[0]!.doOpen("room-1");
    expect(status).toHaveBeenLastCalledWith("connected", expect.any(String));
  });

  it("keeps retrying with backoff while the server stays unreachable", async () => {
    const { net, peers } = makeNetwork();
    const hosting = net.hostGame("player1");
    peers[0]!.doOpen("room-1");
    await hosting;

    const peer = peers[0]!;
    peer.reconnect.mockImplementation(() => {
      // Server unreachable: PeerJS emits a network error and stays disconnected.
      peer.disconnected = true;
      peer.emit("error", { type: "network" });
    });
    peer.dropSignaling();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(peer.reconnect.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("does not try to reconnect after destroy", async () => {
    const { net, peers } = makeNetwork();
    const hosting = net.hostGame("player1");
    peers[0]!.doOpen("room-1");
    await hosting;

    net.destroy();
    peers[0]!.dropSignaling();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(peers[0]!.reconnect).not.toHaveBeenCalled();
  });

  it("answers client pings with pongs", async () => {
    const { net, peers } = makeNetwork();
    const hosting = net.hostGame("player1");
    peers[0]!.doOpen("room-1");
    await hosting;
    net.initHostState(twoHumanState());

    const conn = new FakeConn("client-a");
    peers[0]!.emit("connection", conn);
    conn.doOpen();
    conn.receive({ type: "ping" });
    expect(conn.sent).toContainEqual({ type: "pong" });
  });

  it("marks a heartbeating client disconnected once it goes silent", async () => {
    const onPlayerConnectionChange = vi.fn();
    const { net, peers } = makeNetwork({ onPlayerConnectionChange });
    const hosting = net.hostGame("player1");
    peers[0]!.doOpen("room-1");
    await hosting;
    net.initHostState(twoHumanState());

    const pinger = new FakeConn("client-a");
    peers[0]!.emit("connection", pinger);
    pinger.doOpen();
    pinger.receive({ type: "join", name: "Guest" });
    pinger.receive({ type: "ping" });

    await vi.advanceTimersByTimeAsync(20_000);
    expect(onPlayerConnectionChange).toHaveBeenCalledWith("player2", "disconnected", "Timed out");
  });

  it("never times out a client build that does not heartbeat", async () => {
    const onPlayerConnectionChange = vi.fn();
    const { net, peers } = makeNetwork({ onPlayerConnectionChange });
    const hosting = net.hostGame("player1");
    peers[0]!.doOpen("room-1");
    await hosting;
    net.initHostState(twoHumanState());

    const legacy = new FakeConn("client-a");
    peers[0]!.emit("connection", legacy);
    legacy.doOpen();
    legacy.receive({ type: "join", name: "Guest" });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(onPlayerConnectionChange).not.toHaveBeenCalledWith("player2", "disconnected", expect.anything());
  });

  it("ignores a saved pid whose seat belongs to a differently named player", async () => {
    const { net, peers } = makeNetwork();
    const hosting = net.hostGame("player1");
    peers[0]!.doOpen("room-1");
    await hosting;
    const state = createInitialState([
      { id: "player1", name: "Host", color: "#e74c3c", isBot: false },
      { id: "player2", name: "Alice", color: "#3498db", isBot: false },
      { id: "player3", name: "Bob", color: "#2ecc71", isBot: false },
    ]);
    net.initHostState(state);

    const alice = new FakeConn("a");
    peers[0]!.emit("connection", alice);
    alice.doOpen();
    alice.receive({ type: "join", name: "Alice", pid: "player2" });

    // Bob's tab on the same device picked up Alice's pid from localStorage.
    const bob = new FakeConn("b");
    peers[0]!.emit("connection", bob);
    bob.doOpen();
    bob.receive({ type: "join", name: "Bob", pid: "player2" });
    expect(bob.sent[0]).toMatchObject({ type: "welcome", pid: "player3" });
    expect(alice.closed).toBe(false);
  });

  it("rebinds a pid-less rejoin to the human seat with the same name, even if a stale connection holds it", async () => {
    const { net, peers } = makeNetwork();
    const hosting = net.hostGame("player1");
    peers[0]!.doOpen("room-1");
    await hosting;
    net.initHostState(twoHumanState());

    const stale = new FakeConn("client-old");
    peers[0]!.emit("connection", stale);
    stale.doOpen();
    stale.receive({ type: "join", name: "Guest" });
    expect(stale.sent[0]).toMatchObject({ type: "welcome", pid: "player2" });

    // Client lost sessionStorage (PWA relaunch) and rejoins with no pid while
    // the host has not yet noticed the old connection died (silent for a while).
    await vi.advanceTimersByTimeAsync(7000);
    const fresh = new FakeConn("client-new");
    peers[0]!.emit("connection", fresh);
    fresh.doOpen();
    fresh.receive({ type: "join", name: "Guest" });
    expect(fresh.sent[0]).toMatchObject({ type: "welcome", pid: "player2" });
    expect(stale.closed).toBe(true);
  });
});


// ─── Host seat assignment (review fixes) ─────────────────────────────────────

/** Host + game where turn order is shuffled: Bob's seat comes first. */
async function hostWithShuffledSeats() {
  const ctx = makeNetwork({
    onPlayerConnectionChange: vi.fn(),
    onPendingJoinClosed: vi.fn(),
  });
  const hosting = ctx.net.hostGame("player1");
  ctx.peers[0]!.doOpen("room-1");
  await hosting;
  const base = createInitialState([
    { id: "player1", name: "Host", color: "#e74c3c", isBot: false },
    { id: "player2", name: "Alice", color: "#3498db", isBot: false },
    { id: "player3", name: "Bob", color: "#2ecc71", isBot: false },
  ]);
  const state = { ...base, playerOrder: ["player3", "player1", "player2"] as typeof base.playerOrder };
  const connect = (id: string) => {
    const c = new FakeConn(id);
    ctx.peers[0]!.emit("connection", c);
    c.doOpen();
    return c;
  };
  return { ...ctx, state, connect };
}

describe("host seat assignment", () => {
  it("gives each lobby joiner the seat with their own name, regardless of turn order", async () => {
    const { net, state, connect } = await hostWithShuffledSeats();
    const alice = connect("a");
    alice.receive({ type: "join", name: "Alice" });
    const bob = connect("b");
    bob.receive({ type: "join", name: "Bob" });
    net.initHostState(state);
    expect(alice.sent.find((m) => m.type === "welcome")).toMatchObject({ pid: "player2" });
    expect(bob.sent.find((m) => m.type === "welcome")).toMatchObject({ pid: "player3" });
  });

  it("honors a saved pid for an unheld seat even if the typed name differs", async () => {
    const { net, state, connect } = await hostWithShuffledSeats();
    net.initHostState(state);
    const c = connect("a");
    c.receive({ type: "join", name: "alice", pid: "player2" });
    expect(c.sent[0]).toMatchObject({ type: "welcome", pid: "player2" });
  });

  it("refuses (retryably) to take a seat whose holder is alive", async () => {
    const { net, state, connect } = await hostWithShuffledSeats();
    net.initHostState(state);
    const tab1 = connect("a");
    tab1.receive({ type: "join", name: "Alice", pid: "player2" });
    tab1.receive({ type: "ping" });

    const tab2 = connect("b");
    tab2.receive({ type: "join", name: "Alice", pid: "player2" });
    expect(tab2.sent[0]).toMatchObject({ type: "error", retryable: true });
    expect(tab1.closed).toBe(false);
  });

  it("does not let a new same-named joiner take a live player's seat", async () => {
    const { net, state, connect } = await hostWithShuffledSeats();
    net.initHostState(state);
    const alice = connect("a");
    alice.receive({ type: "join", name: "Alice" });
    const bob = connect("b");
    bob.receive({ type: "join", name: "Bob" });

    const impostor = connect("c");
    impostor.receive({ type: "join", name: "Alice" });
    expect(impostor.sent[0]).toMatchObject({ type: "error" });
    expect(alice.closed).toBe(false);
  });

  it("lets a reconnecting client take over its seat once the old holder has gone quiet", async () => {
    const { net, state, connect } = await hostWithShuffledSeats();
    net.initHostState(state);
    const old = connect("a");
    old.receive({ type: "join", name: "Alice", pid: "player2" });
    old.receive({ type: "ping" });

    await vi.advanceTimersByTimeAsync(7000);
    const fresh = connect("b");
    fresh.receive({ type: "join", name: "Alice", pid: "player2" });
    expect(fresh.sent[0]).toMatchObject({ type: "welcome", pid: "player2" });
    expect(old.closed).toBe(true);
  });

  it("drops a heartbeating lobby connection that goes silent", async () => {
    const onPendingJoinClosed = vi.fn();
    const { net, peers } = makeNetwork({ onPendingJoinClosed });
    const hosting = net.hostGame("player1");
    peers[0]!.doOpen("room-1");
    await hosting;

    const c = new FakeConn("a");
    peers[0]!.emit("connection", c);
    c.doOpen();
    c.receive({ type: "join", name: "Alice" });
    c.receive({ type: "ping" });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(onPendingJoinClosed).toHaveBeenCalledWith("Alice", "Timed out");
  });
});

// ─── Client ───────────────────────────────────────────────────────────────────

describe("client auto-reconnect", () => {
  it("rejoins with its pid after the host connection closes", async () => {
    const { peers, conn, status } = await joinedClient();

    conn.emit("close");
    expect(status).toHaveBeenLastCalledWith("reconnecting", expect.any(String));

    await vi.advanceTimersByTimeAsync(1000);
    const peer2 = peers[1]!;
    expect(peer2).toBeDefined();
    expect(peers[0]!.destroyed).toBe(true);
    peer2.doOpen("client-b");
    const conn2 = peer2.conns[0]!;
    conn2.doOpen();
    expect(conn2.sent[0]).toEqual({ type: "join", name: "Guest", pid: "player2" });

    conn2.receive({ type: "welcome", pid: "player2", state: twoHumanState() });
    await vi.advanceTimersByTimeAsync(0);
    expect(status).toHaveBeenLastCalledWith("connected", expect.any(String));
  });

  it("detects a silently dead data channel via heartbeat and reconnects", async () => {
    const { peers, conn, status } = await joinedClient();

    // Channel looks open but the host never answers pings.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(conn.sent.some((m) => m.type === "ping")).toBe(true);
    expect(status).toHaveBeenCalledWith("reconnecting", expect.any(String));
    expect(peers.length).toBeGreaterThan(1);
  });

  it("stays connected while the host keeps answering pings", async () => {
    const { peers, conn, status } = await joinedClient();
    status.mockClear();

    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(2000);
      if (conn.sent.at(-1)?.type === "ping") conn.receive({ type: "pong" });
    }
    expect(status).not.toHaveBeenCalledWith("reconnecting", expect.any(String));
    expect(peers.length).toBe(1);
  });

  it("treats a failed send as a lost connection", async () => {
    const { net, conn, status } = await joinedClient();
    conn.failSend = true;
    net.sendAction({ type: "END_TURN", pid: "player2" });
    expect(status).toHaveBeenLastCalledWith("reconnecting", expect.any(String));
  });

  it("gives up after repeated failures, then retryConnection starts over", async () => {
    const { net, peers, conn, status } = await joinedClient();

    conn.emit("close");
    // Every reconnect attempt: signaling opens but the room is unreachable.
    for (let i = 0; i < 40; i++) {
      await vi.advanceTimersByTimeAsync(5000);
      const p = peers.at(-1)!;
      if (p !== peers[0] && !p.destroyed && p.handlers.has("error") && p.conns.length === 0) {
        p.emit("error", { type: "peer-unavailable" });
      }
    }
    expect(status).toHaveBeenLastCalledWith("disconnected", expect.any(String));
    const attempts = peers.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(peers.length).toBe(attempts);

    net.retryConnection();
    expect(status).toHaveBeenLastCalledWith("reconnecting", expect.any(String));
    await vi.advanceTimersByTimeAsync(0);
    expect(peers.length).toBe(attempts + 1);
  });

  it("re-registers with signaling without tearing down a healthy data channel", async () => {
    const { peer, peers, status } = await joinedClient();
    status.mockClear();
    peer.dropSignaling();
    await vi.advanceTimersByTimeAsync(1000);
    expect(peer.reconnect).toHaveBeenCalled();
    expect(peers.length).toBe(1);
    expect(status).not.toHaveBeenCalledWith("reconnecting", expect.any(String));
  });

  it("gives up immediately (one toast) when the host rejects a reconnect", async () => {
    const onError = vi.fn();
    const ctx = makeNetwork({ onError });
    const joined = ctx.net.joinGame("room-1", "Guest");
    ctx.peers[0]!.doOpen("client-a");
    ctx.peers[0]!.conns[0]!.doOpen();
    ctx.peers[0]!.conns[0]!.receive({ type: "welcome", pid: "player2", state: twoHumanState() });
    await joined;

    ctx.peers[0]!.conns[0]!.emit("close");
    await vi.advanceTimersByTimeAsync(1000);
    const p2 = ctx.peers[1]!;
    p2.doOpen("client-b");
    p2.conns[0]!.doOpen();
    p2.conns[0]!.receive({ type: "error", msg: "No open slot" });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(ctx.peers.length).toBe(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(ctx.status).toHaveBeenLastCalledWith("disconnected", expect.any(String));
  });

  it("keeps retrying quietly when the host says the seat is still held", async () => {
    const onError = vi.fn();
    const ctx = makeNetwork({ onError });
    const joined = ctx.net.joinGame("room-1", "Guest");
    ctx.peers[0]!.doOpen("client-a");
    ctx.peers[0]!.conns[0]!.doOpen();
    ctx.peers[0]!.conns[0]!.receive({ type: "welcome", pid: "player2", state: twoHumanState() });
    await joined;

    ctx.peers[0]!.conns[0]!.emit("close");
    await vi.advanceTimersByTimeAsync(1000);
    const p2 = ctx.peers[1]!;
    p2.doOpen("client-b");
    p2.conns[0]!.doOpen();
    p2.conns[0]!.receive({ type: "error", msg: "Seat in use", retryable: true });
    await vi.advanceTimersByTimeAsync(3000);

    expect(ctx.peers.length).toBe(3);
    expect(onError).not.toHaveBeenCalled();
  });

  it("resets signaling backoff after the client re-registers", async () => {
    const { peer } = await joinedClient();
    for (let i = 0; i < 3; i++) {
      peer.reconnect.mockClear();
      peer.dropSignaling();
      await vi.advanceTimersByTimeAsync(1000);
      expect(peer.reconnect).toHaveBeenCalledTimes(1);
      peer.doOpen("client-a");
    }
  });

  it("does not auto-reconnect after destroy", async () => {
    const { net, peers, conn } = await joinedClient();
    net.destroy();
    conn.emit("close");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(peers.length).toBe(1);
  });
});
