/**
 * ui.ts — Lobby + game UI event wiring for Catan C&K
 *
 * Two screens:
 *   1. Lobby  — configure players (human/bot), host or join by room code
 *   2. Game   — board + player hand panel + action buttons
 */

import type {
  GameState,
  GameAction,
  Player,
  PlayerId,
  VertexId,
  EdgeId,
  HexId,
  ImprovementTrack,
  Resources,
  TurnPhase,
} from './types.js';
import { createInitialState, computeVP } from './game.js';
import { CatanNetwork } from './network.js';
import { initBoardSVG } from './render.js';
import type { BoardRenderer } from './render.js';
import {
  canBuildRoad,
  canBuildSettlement,
  canBuildCity,
  canBuildCityWall,
  canRecruitKnight,
  canPromoteKnight,
  canActivateKnight,
  canImproveCity,
  canPlaceSettlement,
  discardCount,
} from './rules.js';
import { buildGraph } from './board.js';
import { PLAYER_COLORS } from './constants.js';

const graph = buildGraph();

// ─── App Entry Point ──────────────────────────────────────────────────────────

export function mountCatanApp(root: HTMLElement) {
  root.innerHTML = '';
  root.className = 'catan-app';
  // Auto-fill room code from ?room= URL param
  const urlRoom = new URLSearchParams(window.location.search).get('room');
  showLobby(root, urlRoom ?? undefined);
}

// ─── Lobby ────────────────────────────────────────────────────────────────────

interface SlotConfig {
  type: 'human' | 'bot';
  name: string;
}

function showLobby(root: HTMLElement, prefillCode?: string) {
  function setStatus(msg: string, kind: 'info' | 'error' = 'info') {
    const el = root.querySelector('#lobby-status');
    if (el) { el.textContent = msg; el.className = `lobby-status ${kind}`; }
  }

  root.innerHTML = `
    <div class="lobby">
      <h1>Catan: Cities &amp; Knights</h1>
      <div class="lobby-section">
        <h2>Host a new game</h2>
        <div class="join-row">
          <input id="host-name" type="text" placeholder="Your name" maxlength="16" value="Player 1" />
          <button id="btn-host" class="btn-primary">Host Game</button>
        </div>
      </div>
      <div class="lobby-section">
        <h2>Join existing game</h2>
        <div class="join-row">
          <input id="join-name" type="text" placeholder="Your name" maxlength="16" />
          <input id="join-code" type="text" placeholder="Room code" maxlength="36" value="${prefillCode ?? ''}" />
          <button id="btn-join" class="btn-primary">Join</button>
        </div>
      </div>
      <div id="lobby-status" class="lobby-status"></div>
    </div>
  `;

  // Auto-join if room code was in URL
  if (prefillCode) {
    setStatus('Room code detected — enter your name and click Join', 'info');
  }

  root.querySelector('#btn-host')!.addEventListener('click', async () => {
    const name = (root.querySelector<HTMLInputElement>('#host-name')!).value.trim() || 'Player 1';
    setStatus('Creating room…', 'info');
    await startHostGame(name, root);
  });

  root.querySelector('#btn-join')!.addEventListener('click', async () => {
    const name = (root.querySelector<HTMLInputElement>('#join-name')!).value.trim() || 'Guest';
    const code = (root.querySelector<HTMLInputElement>('#join-code')!).value.trim();
    if (!code) { setStatus('Enter a room code.', 'error'); return; }
    setStatus('Connecting…', 'info');
    await startJoinGame(name, code, root);
  });
}

// ─── Host Game → Waiting Room ─────────────────────────────────────────────────

async function startHostGame(hostName: string, root: HTMLElement) {
  const hostPid = 'player1';
  // Bots added by host (grows as host clicks "Add Bot")
  const bots: Array<{ name: string }> = [];
  // Humans who connected before game starts
  const pendingHumans: string[] = [];

  const net = new CatanNetwork({
    onStateUpdate() {},
    onError(msg) { showToast(root, msg, 'error'); },
    onPendingJoin(name) {
      pendingHumans.push(name);
      renderWaitingRoom();
      showToast(root, `${name} is waiting to join`, 'info');
    },
    onPlayerJoined(name) { showToast(root, `${name} joined`, 'info'); },
  });

  let roomCode: string;
  try {
    roomCode = await net.hostGame(hostPid);
  } catch (e: any) {
    root.querySelector('#lobby-status')!.textContent = `Failed: ${e?.message ?? 'unknown error'}`;
    return;
  }

  function renderWaitingRoom() {
    const totalSlots = 1 + pendingHumans.length + bots.length;
    const canAddBot = totalSlots < 4;
    const canStart = totalSlots >= 2;

    root.innerHTML = `
      <div class="lobby">
        <h1>Catan: Cities &amp; Knights</h1>
        <div class="lobby-section">
          <h2>Room Code</h2>
          <div class="room-code-display">
            <span class="room-code-value">${roomCode}</span>
            <button id="copy-code" class="btn-secondary">Copy</button>
            <button id="show-qr" class="btn-secondary">QR Code</button>
          </div>
          <p class="join-hint">Share this code so others can join</p>
        </div>
        <div class="lobby-section">
          <h2>Players (${totalSlots}/4)</h2>
          <div class="waiting-player-list">
            <div class="waiting-player-row">
              <span class="slot-color" style="background:${PLAYER_COLORS[0]}"></span>
              <span class="waiting-player-name">${hostName} (You)</span>
            </div>
            ${pendingHumans.map((name, i) => `
              <div class="waiting-player-row">
                <span class="slot-color" style="background:${PLAYER_COLORS[1 + i] ?? '#999'}"></span>
                <span class="waiting-player-name">${name} ⏳</span>
              </div>
            `).join('')}
            ${bots.map((bot, i) => {
              const colorIdx = 1 + pendingHumans.length + i;
              return `
              <div class="waiting-player-row">
                <span class="slot-color" style="background:${PLAYER_COLORS[colorIdx] ?? '#999'}"></span>
                <span class="waiting-player-name">${bot.name} (Bot)</span>
                <button class="btn-remove" data-bot-idx="${i}">✕</button>
              </div>`;
            }).join('')}
          </div>
          ${canAddBot ? `<button id="add-bot" class="btn-secondary">+ Add Bot</button>` : ''}
        </div>
        <button id="btn-start" class="btn-primary btn-large"${canStart ? '' : ' disabled'}>Start Game</button>
      </div>
      <div id="toast" class="toast hidden"></div>
    `;

    root.querySelector('#copy-code')?.addEventListener('click', () => {
      navigator.clipboard.writeText(roomCode).then(() => showToast(root, 'Copied!', 'info'));
    });

    root.querySelector('#show-qr')?.addEventListener('click', () => {
      const joinUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
      showQRModal(root, joinUrl, roomCode);
    });

    root.querySelector('#add-bot')?.addEventListener('click', () => {
      if (bots.length + pendingHumans.length + 1 < 4) {
        bots.push({ name: `Bot ${bots.length + pendingHumans.length + 2}` });
        renderWaitingRoom();
      }
    });

    root.querySelectorAll<HTMLButtonElement>('.btn-remove[data-bot-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.botIdx!);
        bots.splice(idx, 1);
        renderWaitingRoom();
      });
    });

    root.querySelector('#btn-start')?.addEventListener('click', () => {
      if (totalSlots < 2) return;
      launchGame();
    });
  }

  function launchGame() {
    // Build ordered player list: host, then pending humans (in join order), then bots
    const players = [
      { id: 'player1', name: hostName, color: PLAYER_COLORS[0]!, isBot: false },
      ...pendingHumans.map((name, i) => ({
        id: `player${2 + i}`,
        name,
        color: PLAYER_COLORS[1 + i] ?? '#999',
        isBot: false,
      })),
      ...bots.map((bot, i) => ({
        id: `player${2 + pendingHumans.length + i}`,
        name: bot.name,
        color: PLAYER_COLORS[1 + pendingHumans.length + i] ?? '#999',
        isBot: true,
      })),
    ];

    let renderer: BoardRenderer | null = null;
    let currentState: GameState = createInitialState(players);
    let pendingAction: PendingAction | null = null;

    net.updateCallbacks({
      onStateUpdate(state) {
        currentState = state;
        if (renderer) {
          updateGame(root, state, hostPid, net, renderer, pa => { pendingAction = pa; }, pendingAction);
        }
      },
    });

    net.initHostState(currentState);

    showGameScreen(root, roomCode);
    renderer = initBoardSVG(root.querySelector<SVGSVGElement>('.board-svg')!);
    updateGame(root, currentState, hostPid, net, renderer, pa => { pendingAction = pa; }, null);
  }

  renderWaitingRoom();
}

// ─── Join Game ────────────────────────────────────────────────────────────────

async function startJoinGame(name: string, roomCode: string, root: HTMLElement) {
  let renderer: BoardRenderer | null = null;
  let pendingAction: PendingAction | null = null;
  let localPid: PlayerId | null = null;

  // Restore pid from a previous session for this room (enables reconnect)
  const sessionKey = `catan-pid-${roomCode}`;
  const savedPid = sessionStorage.getItem(sessionKey) as PlayerId | null;

  const net = new CatanNetwork({
    onStateUpdate(state) {
      if (!localPid) {
        localPid = net.myPid;
        if (localPid) sessionStorage.setItem(sessionKey, localPid);
      }
      if (!localPid) return;
      if (!renderer) {
        showGameScreen(root, null);
        renderer = initBoardSVG(root.querySelector<SVGSVGElement>('.board-svg')!);
      }
      updateGame(root, state, localPid, net, renderer, pa => { pendingAction = pa; }, pendingAction);
    },
    onError(msg) { showToast(root, msg, 'error'); },
  });

  try {
    await net.joinGame(roomCode, name, savedPid ?? undefined);
  } catch (e: any) {
    root.querySelector('#lobby-status')?.textContent && (root.querySelector('#lobby-status')!.textContent = `Failed: ${e?.message}`);
    showToast(root, `Failed to join: ${e?.message}`, 'error');
  }
}

// ─── Game Screen Shell ────────────────────────────────────────────────────────

function showGameScreen(root: HTMLElement, roomCode: string | null) {
  root.innerHTML = `
    <div class="game-layout">
      ${roomCode ? `<div class="room-code-banner">Room: <strong>${roomCode}</strong></div>` : ''}
      <div class="board-area">
        <svg class="board-svg" viewBox="-420 -400 840 800" xmlns="http://www.w3.org/2000/svg"></svg>
      </div>
      <div class="side-panel">
        <div id="phase-banner" class="phase-banner"></div>
        <div id="players-panel" class="players-panel"></div>
        <div id="hand-panel" class="hand-panel"></div>
        <div id="action-panel" class="action-panel"></div>
        <div id="log-panel" class="log-panel"></div>
      </div>
    </div>
    <div id="toast" class="toast hidden"></div>
    <div id="modal" class="modal hidden"></div>
  `;
}

// ─── QR Code Modal ────────────────────────────────────────────────────────────

async function showQRModal(root: HTMLElement, url: string, roomCode: string) {
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.innerHTML = `
    <div class="modal-box" style="text-align:center">
      <h3>Scan to Join</h3>
      <canvas id="qr-canvas" style="margin:1rem auto;display:block;border-radius:4px"></canvas>
      <p style="font-size:0.8rem;color:#c8b47a;margin:0.8rem 0">Room code: <strong>${roomCode}</strong></p>
      <button id="close-qr" class="btn-secondary">Close</button>
    </div>
  `;
  root.appendChild(overlay);

  const canvas = overlay.querySelector<HTMLCanvasElement>('#qr-canvas')!;
  const QRCode = await import('qrcode');
  await QRCode.toCanvas(canvas, url, { width: 220, color: { dark: '#1a3a1a', light: '#f0e8d0' } });

  overlay.querySelector('#close-qr')!.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ─── Pending Action ───────────────────────────────────────────────────────────

type PendingAction =
  | { type: 'build_road' }
  | { type: 'build_settlement' }
  | { type: 'build_city' }
  | { type: 'build_city_wall' }
  | { type: 'recruit_knight' }
  | { type: 'promote_knight' }
  | { type: 'activate_knight' }
  | { type: 'move_robber' };

// ─── Main Render ──────────────────────────────────────────────────────────────

function updateGame(
  root: HTMLElement,
  state: GameState,
  localPid: PlayerId,
  net: CatanNetwork,
  renderer: BoardRenderer,
  setPending: (pa: PendingAction | null) => void,
  pending: PendingAction | null,
) {
  const isMyTurn = state.currentPlayerId === localPid;
  const me = state.players[localPid]!;

  // Phase banner
  const phaseBanner = root.querySelector('#phase-banner');
  if (phaseBanner) {
    phaseBanner.textContent = phaseLabel(state, localPid);
    phaseBanner.className = `phase-banner${isMyTurn ? ' my-turn' : ''}`;
  }

  // Players panel
  const playersPanel = root.querySelector('#players-panel');
  if (playersPanel) {
    playersPanel.innerHTML = state.playerOrder.map(pid => {
      const p = state.players[pid]!;
      const vp = computeVP(state, pid);
      const cards = totalCards(p.resources);
      return `<div class="player-row${pid === state.currentPlayerId ? ' active' : ''}" style="border-left:4px solid ${p.color}">
        <span class="player-name">${p.name}${p.isBot ? ' 🤖' : ''}</span>
        <span class="player-vp">${vp} VP</span>
        <span class="player-cards">${cards}🃏</span>
      </div>`;
    }).join('');
  }

  // Hand panel
  const handPanel = root.querySelector('#hand-panel');
  if (handPanel) {
    const r = me.resources;
    const keys: (keyof Resources)[] = ['brick','lumber','ore','grain','wool','cloth','coin','paper'];
    handPanel.innerHTML = `
      <div class="hand-title">Your hand</div>
      <div class="hand-cards">${keys.map(k => r[k] > 0 ? `<span class="card card-${k}">${CARD_EMOJI[k]}×${r[k]}</span>` : '').join('')}</div>
      ${me.progressCards.length ? `<div class="progress-cards">${me.progressCards.map(c => `<span class="prog-card${c.isVP ? ' vp-card' : ''}">${c.name}</span>`).join('')}</div>` : ''}
      <div class="improvements">🔬${me.improvements.science} 🤝${me.improvements.trade} ⚔️${me.improvements.politics}</div>
    `;
  }

  // Log panel
  const logPanel = root.querySelector('#log-panel');
  if (logPanel) {
    logPanel.innerHTML = state.log.slice(-8).map(l => `<div class="log-line">${l}</div>`).join('');
    logPanel.scrollTop = logPanel.scrollHeight;
  }

  // Compute valid targets based on pending action
  const validVertices = new Set<VertexId>();
  const validEdges = new Set<EdgeId>();
  const validHexes = new Set<HexId>();

  if (isMyTurn && state.phase === 'ACTION' && pending) {
    computeValidTargets(state, localPid, pending, validVertices, validEdges);
  } else if (isMyTurn && state.phase === 'ROBBER_MOVE') {
    Object.values(state.board.hexes).forEach(h => { if (!h.hasRobber) validHexes.add(h.id); });
  } else if (isMyTurn && (state.phase === 'SETUP_R1_ROAD' || state.phase === 'SETUP_R2_ROAD')) {
    computeSetupRoadEdges(state, localPid, validEdges);
  } else if (isMyTurn && state.phase === 'SETUP_R1_SETTLEMENT') {
    Object.keys(graph.vertices).forEach(vid => {
      if (canPlaceSettlement(state.board, graph, localPid, vid as VertexId, true)) validVertices.add(vid as VertexId);
    });
  } else if (isMyTurn && state.phase === 'SETUP_R2_CITY') {
    Object.keys(graph.vertices).forEach(vid => {
      if (canPlaceSettlement(state.board, graph, localPid, vid as VertexId, true)) validVertices.add(vid as VertexId);
    });
  }

  // Action panel
  const actionPanel = root.querySelector('#action-panel');
  if (actionPanel) {
    if (isMyTurn) {
      renderActionPanel(actionPanel, state, localPid, net, setPending, pending, me);
    } else {
      actionPanel.innerHTML = '';
    }
  }

  // Discard modal
  if (state.phase === 'DISCARD') {
    const needed = state.pendingDiscard?.remaining[localPid] ?? 0;
    if (needed > 0) showDiscardModal(root, state, localPid, needed, a => net.sendAction(a));
  }

  renderer.setCallbacks({
    onVertexClick(vid) {
      console.log('[catan] vertex click', vid, 'phase:', state.phase, 'myTurn:', isMyTurn);
      if (!isMyTurn) return;
      handleVertexClick(vid, state, localPid, pending, net, setPending);
    },
    onEdgeClick(eid) {
      console.log('[catan] edge click', eid, 'phase:', state.phase, 'myTurn:', isMyTurn);
      if (!isMyTurn) return;
      handleEdgeClick(eid, state, localPid, pending, net, setPending);
    },
    onHexClick(hid) {
      console.log('[catan] hex click', hid, 'phase:', state.phase);
      if (!isMyTurn || state.phase !== 'ROBBER_MOVE') return;
      handleHexClick(hid, state, localPid, net);
    },
  });
  renderer.render(state, localPid, validVertices, validEdges, validHexes);
}

// ─── Valid Target Computation ─────────────────────────────────────────────────

function computeValidTargets(
  state: GameState,
  pid: PlayerId,
  pending: PendingAction,
  validVertices: Set<VertexId>,
  validEdges: Set<EdgeId>,
) {
  const { board } = state;
  const me = state.players[pid]!;

  switch (pending.type) {
    case 'build_road':
      Object.keys(graph.edges).forEach(eid => {
        if (canBuildRoad(board, graph, me, eid as EdgeId)) validEdges.add(eid as EdgeId);
      });
      break;
    case 'build_settlement':
      Object.keys(graph.vertices).forEach(vid => {
        if (canBuildSettlement(board, graph, me, vid as VertexId)) validVertices.add(vid as VertexId);
      });
      break;
    case 'build_city':
      Object.entries(board.vertices).forEach(([vid, b]) => {
        if (b?.type === 'settlement' && b.playerId === pid && canBuildCity(board, me, vid as VertexId))
          validVertices.add(vid as VertexId);
      });
      break;
    case 'build_city_wall':
      Object.entries(board.vertices).forEach(([vid, b]) => {
        if (b?.type === 'city' && b.playerId === pid && !b.hasWall && canBuildCityWall(board, me, vid as VertexId))
          validVertices.add(vid as VertexId);
      });
      break;
    case 'recruit_knight':
      Object.keys(graph.vertices).forEach(vid => {
        if (canRecruitKnight(board, graph, me, vid as VertexId)) validVertices.add(vid as VertexId);
      });
      break;
    case 'promote_knight':
      Object.entries(board.knights).forEach(([vid, k]) => {
        if (k?.playerId === pid && canPromoteKnight(board, me, vid as VertexId, pid))
          validVertices.add(vid as VertexId);
      });
      break;
    case 'activate_knight':
      Object.entries(board.knights).forEach(([vid, k]) => {
        if (k?.playerId === pid && canActivateKnight(board, me, vid as VertexId, pid))
          validVertices.add(vid as VertexId);
      });
      break;
  }
}

function computeSetupRoadEdges(state: GameState, pid: PlayerId, validEdges: Set<EdgeId>) {
  // During setup, valid road edges are adjacent to the player's most recent building
  // Find buildings owned by player with no adjacent road
  const { board } = state;
  const myBuildings = Object.entries(board.vertices)
    .filter(([, b]) => b?.playerId === pid)
    .map(([vid]) => vid as VertexId);

  for (const vid of myBuildings) {
    const edges = graph.edgesOfVertex[vid] ?? [];
    for (const eid of edges) {
      if (!board.edges[eid]) validEdges.add(eid);
    }
  }
}

// ─── Action Panel ─────────────────────────────────────────────────────────────

function renderActionPanel(
  panel: Element,
  state: GameState,
  pid: PlayerId,
  net: CatanNetwork,
  setPending: (pa: PendingAction | null) => void,
  pending: PendingAction | null,
  me: Player,
) {
  panel.innerHTML = '';
  const { board } = state;

  function send(action: GameAction) { setPending(null); net.sendAction(action); }
  function btn(label: string, onClick: () => void, active = false, disabled = false) {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = `action-btn${active ? ' active' : ''}${disabled ? ' disabled' : ''}`;
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    panel.appendChild(b);
  }

  if (state.phase === 'SETUP_R1_SETTLEMENT') {
    const instruction = panel.ownerDocument.createElement('p');
    instruction.className = 'action-instruction';
    instruction.textContent = '👆 Click a yellow dot on the board to place your settlement';
    panel.appendChild(instruction);
    return;
  }
  if (state.phase === 'SETUP_R1_ROAD') {
    const instruction = panel.ownerDocument.createElement('p');
    instruction.className = 'action-instruction';
    instruction.textContent = '👆 Click a yellow line on the board to place your road';
    panel.appendChild(instruction);
    return;
  }
  if (state.phase === 'SETUP_R2_CITY') {
    const instruction = panel.ownerDocument.createElement('p');
    instruction.className = 'action-instruction';
    instruction.textContent = '👆 Click a yellow dot on the board to place your city';
    panel.appendChild(instruction);
    return;
  }
  if (state.phase === 'SETUP_R2_ROAD') {
    const instruction = panel.ownerDocument.createElement('p');
    instruction.className = 'action-instruction';
    instruction.textContent = '👆 Click a yellow line on the board to place your road';
    panel.appendChild(instruction);
    return;
  }

  if (state.phase === 'ROLL_DICE') {
    btn('🎲 Roll Dice', () => send({ type: 'ROLL_DICE', pid }));
    return;
  }

  if (state.phase === 'ROBBER_MOVE') {
    btn('Click a hex to move robber…', () => {}, true);
    return;
  }

  if (state.phase !== 'ACTION') return;

  // Build road
  const canRoad = Object.keys(graph.edges).some(eid => canBuildRoad(board, graph, me, eid as EdgeId));
  if (pending?.type === 'build_road') {
    btn('Cancel Road', () => setPending(null), true);
  } else {
    btn('🛣️ Road', () => setPending({ type: 'build_road' }), false, !canRoad);
  }

  // Build settlement
  const canSettle = Object.keys(graph.vertices).some(vid => canBuildSettlement(board, graph, me, vid as VertexId));
  if (pending?.type === 'build_settlement') {
    btn('Cancel Settlement', () => setPending(null), true);
  } else {
    btn('🏠 Settlement', () => setPending({ type: 'build_settlement' }), false, !canSettle);
  }

  // Build city
  const canCity = Object.entries(board.vertices).some(([vid, b]) =>
    b?.type === 'settlement' && b.playerId === pid && canBuildCity(board, me, vid as VertexId)
  );
  if (pending?.type === 'build_city') {
    btn('Cancel City', () => setPending(null), true);
  } else {
    btn('🏙️ City', () => setPending({ type: 'build_city' }), false, !canCity);
  }

  // City wall
  const canWall = Object.entries(board.vertices).some(([vid, b]) =>
    b?.type === 'city' && b.playerId === pid && !b.hasWall && canBuildCityWall(board, me, vid as VertexId)
  );
  if (pending?.type === 'build_city_wall') {
    btn('Cancel Wall', () => setPending(null), true);
  } else {
    btn('🏰 Wall', () => setPending({ type: 'build_city_wall' }), false, !canWall);
  }

  // Knight
  const canKnight = Object.keys(graph.vertices).some(vid => canRecruitKnight(board, graph, me, vid as VertexId));
  if (pending?.type === 'recruit_knight') {
    btn('Cancel Knight', () => setPending(null), true);
  } else {
    btn('⚔️ Knight', () => setPending({ type: 'recruit_knight' }), false, !canKnight);
  }

  // Promote knight
  const canPromote = Object.entries(board.knights).some(([vid, k]) =>
    k?.playerId === pid && canPromoteKnight(board, me, vid as VertexId, pid)
  );
  if (pending?.type === 'promote_knight') {
    btn('Cancel Promote', () => setPending(null), true);
  } else {
    btn('⬆️ Promote', () => setPending({ type: 'promote_knight' }), false, !canPromote);
  }

  // Activate knight
  const canActivate = Object.entries(board.knights).some(([vid, k]) =>
    k?.playerId === pid && canActivateKnight(board, me, vid as VertexId, pid)
  );
  if (pending?.type === 'activate_knight') {
    btn('Cancel Activate', () => setPending(null), true);
  } else {
    btn('🛡️ Activate', () => setPending({ type: 'activate_knight' }), false, !canActivate);
  }

  // Improve city
  const tracks: ImprovementTrack[] = ['science', 'trade', 'politics'];
  const trackLabel: Record<ImprovementTrack, string> = { science: '🔬 Science', trade: '🤝 Trade', politics: '⚔️ Politics' };
  for (const track of tracks) {
    const can = canImproveCity(board, me, track);
    btn(trackLabel[track], () => send({ type: 'IMPROVE_CITY', pid, track }), false, !can);
  }

  // Trade bank
  btn('🏦 Trade', () => showTradeBankModal(document.body.querySelector('.catan-app') ?? document.body, state, pid, a => send(a)));

  // End turn
  btn('✓ End Turn', () => send({ type: 'END_TURN', pid }));
}

// ─── Board Click Handlers ─────────────────────────────────────────────────────

function handleVertexClick(
  vid: VertexId,
  state: GameState,
  pid: PlayerId,
  pending: PendingAction | null,
  net: CatanNetwork,
  setPending: (pa: PendingAction | null) => void,
) {
  function send(action: GameAction) { setPending(null); net.sendAction(action); }

  if (state.phase === 'SETUP_R1_SETTLEMENT') {
    send({ type: 'PLACE_BUILDING', pid, vid, building: 'settlement' });
  } else if (state.phase === 'SETUP_R2_CITY') {
    send({ type: 'PLACE_BUILDING', pid, vid, building: 'city' });
  } else if (pending?.type === 'build_settlement') {
    send({ type: 'BUILD_SETTLEMENT', pid, vid });
  } else if (pending?.type === 'build_city') {
    send({ type: 'BUILD_CITY', pid, vid });
  } else if (pending?.type === 'build_city_wall') {
    send({ type: 'BUILD_CITY_WALL', pid, vid });
  } else if (pending?.type === 'recruit_knight') {
    send({ type: 'RECRUIT_KNIGHT', pid, vid });
  } else if (pending?.type === 'promote_knight') {
    send({ type: 'PROMOTE_KNIGHT', pid, vid });
  } else if (pending?.type === 'activate_knight') {
    send({ type: 'ACTIVATE_KNIGHT', pid, vid });
  }
}

function handleEdgeClick(
  eid: EdgeId,
  state: GameState,
  pid: PlayerId,
  pending: PendingAction | null,
  net: CatanNetwork,
  setPending: (pa: PendingAction | null) => void,
) {
  function send(action: GameAction) { setPending(null); net.sendAction(action); }

  if (state.phase === 'SETUP_R1_ROAD' || state.phase === 'SETUP_R2_ROAD') {
    send({ type: 'PLACE_ROAD', pid, eid });
  } else if (pending?.type === 'build_road') {
    send({ type: 'BUILD_ROAD', pid, eid });
  }
}

function handleHexClick(
  hid: HexId,
  state: GameState,
  pid: PlayerId,
  net: CatanNetwork,
) {
  // Find an opponent building adjacent to this hex to steal from
  const adjacentBuildings = Object.entries(state.board.vertices)
    .filter(([vid, b]) => {
      if (!b || b.playerId === pid) return false;
      return (graph.hexesOfVertex[vid as VertexId] ?? []).includes(hid);
    });
  const stealFrom = adjacentBuildings[0]?.[1]?.playerId ?? null;
  net.sendAction({ type: 'MOVE_ROBBER', pid, hid, stealFrom });
}

// ─── Discard Modal ────────────────────────────────────────────────────────────

function showDiscardModal(
  root: HTMLElement,
  state: GameState,
  pid: PlayerId,
  needed: number,
  sendAction: (a: GameAction) => void,
) {
  let modal = root.querySelector<HTMLElement>('#modal');
  if (!modal) return;
  if (!modal.classList.contains('hidden')) return; // already shown

  const me = state.players[pid]!;
  const r = me.resources;
  const selected: Partial<Resources> = {};

  function selectedTotal() {
    return Object.values(selected).reduce((a, b) => a + (b ?? 0), 0);
  }

  function renderModal() {
    const keys: (keyof Resources)[] = ['brick','lumber','ore','grain','wool','cloth','coin','paper'];
    const total = selectedTotal();
    modal!.innerHTML = `
      <div class="modal-box">
        <h3>Discard ${needed} cards</h3>
        <div class="discard-grid">
          ${keys.map(k => r[k] > 0 ? `
            <div class="discard-item">
              <span>${CARD_EMOJI[k]} ${k} (${r[k]})</span>
              <div class="counter">
                <button class="cnt-btn" data-key="${k}" data-dir="-1">−</button>
                <span>${selected[k] ?? 0}</span>
                <button class="cnt-btn" data-key="${k}" data-dir="1">+</button>
              </div>
            </div>
          ` : '').join('')}
        </div>
        <div>Selected: ${total} / ${needed}</div>
        <button id="confirm-discard" class="btn-primary"${total !== needed ? ' disabled' : ''}>Discard</button>
      </div>
    `;

    modal!.querySelectorAll<HTMLButtonElement>('.cnt-btn').forEach(b => {
      b.addEventListener('click', () => {
        const key = b.dataset.key as keyof Resources;
        const dir = parseInt(b.dataset.dir!);
        const cur = selected[key] ?? 0;
        const tot = selectedTotal();
        if (dir > 0 && tot >= needed) return;
        selected[key] = Math.max(0, Math.min(r[key], cur + dir));
        renderModal();
      });
    });

    modal!.querySelector('#confirm-discard')?.addEventListener('click', () => {
      if (selectedTotal() !== needed) return;
      modal!.classList.add('hidden');
      sendAction({ type: 'DISCARD', pid, cards: selected });
    });
  }

  modal.classList.remove('hidden');
  renderModal();
}

// ─── Trade Bank Modal ─────────────────────────────────────────────────────────

function showTradeBankModal(
  root: HTMLElement,
  state: GameState,
  pid: PlayerId,
  sendAction: (a: GameAction) => void,
) {
  const modal = root.querySelector<HTMLElement>('#modal');
  if (!modal) return;

  const me = state.players[pid]!;
  const r = me.resources;
  const allKeys: (keyof Resources)[] = ['brick','lumber','ore','grain','wool','cloth','coin','paper'];

  const ratios: Record<keyof Resources, number> = {
    brick:4, lumber:4, ore:4, grain:4, wool:4, cloth:4, coin:4, paper:4,
  };
  for (const harbor of state.board.harbors) {
    const hasHarbor = harbor.vertices.some(vid => state.board.vertices[vid]?.playerId === pid);
    if (!hasHarbor) continue;
    if (harbor.type === 'generic') {
      for (const k of allKeys) ratios[k] = Math.min(ratios[k], 3);
    } else if (harbor.type in ratios) {
      ratios[harbor.type as keyof Resources] = 2;
    }
  }

  const canGive = allKeys.filter(k => r[k] >= ratios[k]);
  let giveKey: keyof Resources | null = null;
  let getKey: keyof Resources | null = null;

  modal.innerHTML = `
    <div class="modal-box">
      <h3>Trade with Bank</h3>
      <div class="trade-section">
        <label>Give (×ratio):</label>
        <div class="trade-options" id="trade-give">
          ${canGive.map(k => `<button class="trade-card" data-role="give" data-key="${k}">${CARD_EMOJI[k]} ${k}×${ratios[k]}</button>`).join('')}
          ${canGive.length === 0 ? '<span style="color:#a0b0a0;font-size:0.8rem">Not enough resources</span>' : ''}
        </div>
      </div>
      <div class="trade-section">
        <label>Receive:</label>
        <div class="trade-options" id="trade-get">
          ${allKeys.map(k => `<button class="trade-card" data-role="get" data-key="${k}">${CARD_EMOJI[k]} ${k}</button>`).join('')}
        </div>
      </div>
      <div class="trade-actions">
        <button id="confirm-trade" class="btn-primary" disabled>Trade</button>
        <button id="cancel-trade" class="btn-secondary">Cancel</button>
      </div>
    </div>
  `;

  function updateConfirm() {
    const confirmBtn = modal!.querySelector<HTMLButtonElement>('#confirm-trade');
    if (confirmBtn) confirmBtn.disabled = !giveKey || !getKey || giveKey === getKey;
  }

  // Event delegation — one listener handles all clicks inside the modal
  modal.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!btn) return;

    if (btn.dataset.role === 'give') {
      modal!.querySelectorAll('[data-role="give"]').forEach(el => el.classList.remove('selected'));
      btn.classList.add('selected');
      giveKey = btn.dataset.key as keyof Resources;
      updateConfirm();
    } else if (btn.dataset.role === 'get') {
      modal!.querySelectorAll('[data-role="get"]').forEach(el => el.classList.remove('selected'));
      btn.classList.add('selected');
      getKey = btn.dataset.key as keyof Resources;
      updateConfirm();
    } else if (btn.id === 'confirm-trade') {
      if (!giveKey || !getKey || giveKey === getKey) return;
      modal!.classList.add('hidden');
      sendAction({ type: 'TRADE_BANK', pid, give: { [giveKey]: ratios[giveKey] }, get: { [getKey]: 1 } });
    } else if (btn.id === 'cancel-trade') {
      modal!.classList.add('hidden');
    }
  });

  modal.classList.remove('hidden');
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(root: HTMLElement, msg: string, kind: 'info' | 'error' = 'info') {
  const toast = root.querySelector<HTMLElement>('#toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `toast ${kind}`;
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function phaseLabel(state: GameState, localPid: PlayerId): string {
  const isMe = state.currentPlayerId === localPid;
  const name = state.players[state.currentPlayerId]?.name ?? '';
  const prefix = isMe ? 'Your turn' : `${name}'s turn`;

  const labels: Partial<Record<TurnPhase, string>> = {
    SETUP_R1_SETTLEMENT: `${prefix} — Place settlement`,
    SETUP_R1_ROAD:       `${prefix} — Place road`,
    SETUP_R2_CITY:       `${prefix} — Place city`,
    SETUP_R2_ROAD:       `${prefix} — Place road`,
    ROLL_DICE:           `${prefix} — Roll dice`,
    ACTION:              `${prefix} — Build or trade`,
    DISCARD:             isMe ? 'Discard cards!' : 'Waiting for discards…',
    ROBBER_MOVE:         `${prefix} — Move the robber`,
    RESOLVE_BARBARIANS:  'Barbarian attack!',
    RESOLVE_PROGRESS_DRAW: 'Drawing progress cards…',
    GAME_OVER:           state.winner ? `${state.players[state.winner]?.name ?? 'Unknown'} wins! 🎉` : 'Game over',
  };
  return labels[state.phase] ?? prefix;
}

function totalCards(r: Resources): number {
  return r.brick + r.lumber + r.ore + r.grain + r.wool + r.cloth + r.coin + r.paper;
}

const CARD_EMOJI: Record<keyof Resources, string> = {
  brick:  '🧱',
  lumber: '🪵',
  ore:    '⛏️',
  grain:  '🌾',
  wool:   '🐑',
  cloth:  '🧵',
  coin:   '🪙',
  paper:  '📄',
};
