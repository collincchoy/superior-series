<script lang="ts">
  import type { GameState, PlayerId, EventDieFace } from "../../lib/catan/types.js";
  import type {
    PendingAction,
    PendingAdminAction,
  } from "../../lib/catan/validTargets.js";
  import { computeValidTargets } from "../../lib/catan/validTargets.js";
  import { bestKnightUpTo } from "../../lib/catan/rules.js";
  import { isPlayerActing } from "../../lib/catan/turnActors.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import BoardCanvas from "./BoardCanvas.svelte";
  import SidePanel from "./SidePanel.svelte";
  import PlayersPanel from "./PlayersPanel.svelte";
  import DiscardModal from "./DiscardModal.svelte";
  import DiscardProgressModal from "./DiscardProgressModal.svelte";
  import TradeBankModal from "./TradeBankModal.svelte";
  import PlayerTradeModal from "./PlayerTradeModal.svelte";
  import InfoModal from "./InfoModal.svelte";
  import CommercialHarborModal from "./CommercialHarborModal.svelte";
  import VpCardModal from "./VpCardModal.svelte";
  import MasterControlModal from "./MasterControlModal.svelte";
  import BarbarianAttackOverlay from "./BarbarianAttackOverlay.svelte";
  import LogOverlay from "./LogOverlay.svelte";
  import TurnTransitionOverlay from "./TurnTransitionOverlay.svelte";
  import DiceRollModal from "./DiceRollModal.svelte";
  import VPMilestoneOverlay from "./VPMilestoneOverlay.svelte";
  import { computeVP } from "../../lib/catan/game.js";

  let {
    gameState,
    localPid,
    pendingAction,
    roomCode,
  }: {
    gameState: GameState;
    localPid: PlayerId;
    pendingAction: PendingAction | null;
    roomCode: string | null;
  } = $props();

  let isMyTurn = $derived(isPlayerActing(gameState, localPid));
  let showTrade = $state(false);
  let showPlayerTrade = $state(false);
  let isHost = $derived(store.isHostPlayer);
  let isGameOver = $derived(gameState.phase === "GAME_OVER");

  let showTransition = $state(false);
  let transitionPlayer = $state<{ name: string; color: string } | null>(null);
  let prevCurrentPid: string | null = null;

  let showDiceModal = $state(false);
  let diceRoll = $state<[number, number, EventDieFace] | null>(null);
  let diceRollerId = $state<string | null>(null);
  let prevLastRoll: typeof gameState.lastRoll = null;

  let milestoneVP = $state<number | null>(null);
  let prevMilestoneVP = -1;
  $effect(() => {
    const vp = computeVP(gameState, localPid);
    if (prevMilestoneVP === -1) { prevMilestoneVP = vp; return; }
    if (vp > prevMilestoneVP && vp >= 10 && vp <= 12) {
      milestoneVP = vp;
    }
    prevMilestoneVP = vp;
  });

  $effect(() => {
    const roll = gameState.lastRoll;
    if (!roll) return;
    if (roll === prevLastRoll) return;
    if (prevLastRoll !== null && roll[0] === prevLastRoll[0] && roll[1] === prevLastRoll[1] && roll[2] === prevLastRoll[2]) return;
    prevLastRoll = roll;
    diceRoll = roll;
    diceRollerId = gameState.lastRollPid;
    showDiceModal = true;
  });

  $effect(() => {
    const pid = gameState.currentPlayerId;
    const phase = gameState.phase;

    if (prevCurrentPid === null) {
      prevCurrentPid = pid;
      return;
    }
    if (phase.startsWith("SETUP_")) {
      prevCurrentPid = pid;
      return;
    }
    if (pid === prevCurrentPid) return;
    prevCurrentPid = pid;

    const player = gameState.players[pid];
    if (!player) return;
    transitionPlayer = { name: player.name, color: player.color };
    showTransition = true;
  });
  let winnerName = $derived.by(() => {
    if (!gameState.winner) return null;
    return gameState.players[gameState.winner]?.name ?? gameState.winner;
  });
  let now = $state(Date.now());

  let treasonPlacementMsg = $derived.by(() => {
    const pt = gameState.pendingTreason;
    if (!pt || pt.pid !== localPid) return "";
    const best = bestKnightUpTo(gameState.players[localPid]!, pt.maxStrength);
    if (!best) return "Treason: no knights available to place.";
    const label = best < pt.maxStrength
      ? `strength ${best} (highest you have ≤ ${pt.maxStrength})`
      : `strength ${best}`;
    return `Treason: click a valid spot to place a ${label} knight, or`;
  });

  $effect(() => {
    if (gameState.pendingTreason?.pid !== localPid) return;
    if (computeValidTargets(gameState, localPid, null).validVertices.size === 0) {
      store.sendAction({ type: "PROGRESS_SKIP_TREASON", pid: localPid });
    }
  });

  function adminInstruction(pa: PendingAdminAction | null) {
    if (!pa) return null;
    switch (pa.type) {
      case "admin_move_road_pick_from":
        return "Move Road: select the road to move.";
      case "admin_move_road_pick_to":
        return "Move Road: select destination edge.";
      case "admin_move_building_pick_from":
        return "Move Building: select the building to move.";
      case "admin_move_building_pick_to":
        return "Move Building: select destination vertex.";
      case "admin_move_knight_pick_from":
        return "Move Knight: select the knight to move.";
      case "admin_move_knight_pick_to":
        return "Move Knight: select destination vertex.";
      case "admin_swap_number_pick_a":
        return "Swap Number Tokens: select first numbered hex.";
      case "admin_swap_number_pick_b":
        return "Swap Number Tokens: select second numbered hex.";
      case "admin_swap_hex_pick_a":
        return "Swap Hexes: select first hex.";
      case "admin_swap_hex_pick_b":
        return "Swap Hexes: select second hex.";
    }
  }

  $effect(() => {
    const id = setInterval(() => {
      now = Date.now();
      store.tickVisualEffects();
    }, 1000);
    return () => clearInterval(id);
  });

  let activeHexGlows = $derived.by(() => {
    const ids = new Set<string>();
    for (const event of store.hexGlowEvents) {
      for (const hid of event.hexIds) ids.add(hid);
    }
    return Array.from(ids);
  });

  let syncAgeLabel = $derived.by(() => {
    const t = store.lastStateUpdateAt;
    if (!t) return "unsynced";
    const seconds = Math.max(0, Math.floor((now - t) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  });

  let connectionLabel = $derived.by(() => {
    switch (store.connectionStatus) {
      case "connected":
        return "Connected";
      case "connecting":
        return "Connecting";
      case "reconnecting":
        return "Reconnecting";
      case "disconnected":
        return "Disconnected";
      default:
        return "Idle";
    }
  });
</script>

<div class="game-layout">
  {#if roomCode}
    <div class="room-code-banner">
      <span class="room-code-row">
        <span class="room-label">Room:</span>
        <strong class="room-code" title={roomCode}>{roomCode}</strong>
        <span
          class="conn-chip conn-{store.connectionStatus}"
          title={store.connectionStatusDetail || connectionLabel}
        >
          {connectionLabel}
        </span>
        {#if store.lastStateVersion !== null}
          <span class="sync-meta">v{store.lastStateVersion} • {syncAgeLabel}</span>
        {/if}
      </span>
      {#if isHost}
        <button class="control-panel-btn" onclick={() => store.setMasterControlOpen(true)}>
          🪄 Control Panel
        </button>
      {/if}
    </div>
  {/if}
  <PlayersPanel
    {gameState}
    {localPid}
    playerConnectionStatus={store.playerConnectionStatus}
  />
  <div class="board-and-panel">
    <div class="board-wrapper">
      <BoardCanvas
        {gameState}
        {localPid}
        {pendingAction}
        activeHexGlows={activeHexGlows}
      />
      <LogOverlay log={gameState.log} />
    </div>
    <SidePanel
      {gameState}
      {localPid}
      {pendingAction}
      {isMyTurn}
      bind:showTrade
      bind:showPlayerTrade
    />
  </div>
</div>

<DiscardModal {gameState} {localPid} />
<DiscardProgressModal {gameState} {localPid} />
{#if showTrade}
  <TradeBankModal {gameState} {localPid} bind:open={showTrade} />
{/if}
<PlayerTradeModal {gameState} {localPid} bind:openInitiate={showPlayerTrade} />
<CommercialHarborModal {gameState} {localPid} />
<VpCardModal {gameState} {localPid} />
{#if gameState.pendingFreeRoads?.pid === localPid}
  <div class="pending-overlay">
    <span>Road Building: click a valid road edge to place it, or</span>
    <button onclick={() => store.sendAction({ type: "PROGRESS_SKIP_FREE_ROADS", pid: localPid })}>Skip</button>
  </div>
{/if}
{#if gameState.pendingKnightPromotions?.pid === localPid}
  <div class="pending-overlay">
    <span>Smithing: click a knight to promote it free, or</span>
    <button onclick={() => store.sendAction({ type: "PROGRESS_SKIP_FREE_PROMOTIONS", pid: localPid })}>Skip</button>
  </div>
{/if}
{#if gameState.pendingTreason?.pid === localPid}
  <div class="pending-overlay">
    <span>{treasonPlacementMsg}</span>
    <button onclick={() => store.sendAction({ type: "PROGRESS_SKIP_TREASON", pid: localPid })}>Skip</button>
  </div>
{/if}
{#if store.pendingAdminAction}
  <div class="pending-overlay">
    <span>{adminInstruction(store.pendingAdminAction)}</span>
    <button
      onclick={() => {
        store.setPendingAdminAction(null);
        store.setMasterControlOpen(true);
      }}
    >
      Cancel
    </button>
  </div>
{/if}
<InfoModal />
{#if isHost}
  <MasterControlModal
    {gameState}
    {localPid}
    bind:open={store.masterControlOpen}
  />
{/if}

{#if gameState.phase === "RESOLVE_BARBARIANS" && gameState.pendingBarbarian && !showDiceModal}
  <BarbarianAttackOverlay {gameState} />
{/if}

{#if showTransition && transitionPlayer}
  <TurnTransitionOverlay
    name={transitionPlayer.name}
    color={transitionPlayer.color}
    onDone={() => (showTransition = false)}
  />
{/if}

{#if showDiceModal && diceRoll}
  {@const rollerPlayer = gameState.players[diceRollerId ?? localPid]}
  <DiceRollModal
    roll={diceRoll}
    rollerName={rollerPlayer?.name ?? ""}
    isLocalPlayer={diceRollerId === localPid}
    onDone={() => (showDiceModal = false)}
  />
{/if}

{#if milestoneVP !== null}
  {@const localPlayer = gameState.players[localPid]}
  <VPMilestoneOverlay
    vp={milestoneVP}
    color={localPlayer?.color ?? "#f5c842"}
    onDone={() => (milestoneVP = null)}
  />
{/if}

{#if isGameOver}
  <div class="confetti-overlay" aria-hidden="true">
    {#each Array(24) as _, i}
      <span
        class="confetti-piece"
        style="--i:{i};--x:{Math.random() * 100}vw;--r:{Math.random() * 360}deg;--d:{1.5 + Math.random() * 2}s;--c:{['#f5c842','#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e91e63'][i % 8]}"
      ></span>
    {/each}
    <div class="victory-crown">👑</div>
  </div>
  <div class="victory-banner" role="dialog" aria-label="Game over">
    <div class="victory-crown-static">👑</div>
    {#if winnerName}
      <div class="victory-title">{winnerName} wins!</div>
    {:else}
      <div class="victory-title">Game Over</div>
    {/if}
    <button class="return-lobby-btn" onclick={() => store.returnToLobby()}>
      Return to Lobby
    </button>
  </div>
{/if}

<style>
  .game-layout {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .room-code-banner {
    background: #2c5f2e;
    text-align: center;
    padding: 0.24rem 0.75rem;
    font-size: 0.76rem;
    color: #c8f5c8;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    flex-wrap: nowrap;
    min-width: 0;
  }

  .room-code-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
    flex: 1 1 auto;
    justify-content: center;
  }

  .room-label {
    flex-shrink: 0;
    white-space: nowrap;
  }

  .room-code {
    display: block;
    min-width: 0;
    max-width: min(60vw, 24rem);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .conn-chip {
    border-radius: 999px;
    padding: 0.08rem 0.45rem;
    font-size: 0.63rem;
    font-weight: 700;
    border: 1px solid rgba(255, 255, 255, 0.25);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .conn-connected {
    color: #d6ffd6;
    background: rgba(54, 128, 54, 0.45);
    border-color: rgba(125, 216, 125, 0.55);
  }

  .conn-connecting,
  .conn-reconnecting {
    color: #fff2c2;
    background: rgba(140, 112, 43, 0.5);
    border-color: rgba(240, 196, 86, 0.5);
  }

  .conn-disconnected {
    color: #ffd8d8;
    background: rgba(128, 52, 52, 0.55);
    border-color: rgba(230, 120, 120, 0.55);
  }

  .sync-meta {
    font-size: 0.64rem;
    color: #dce9dc;
    white-space: nowrap;
    opacity: 0.92;
  }

  .control-panel-btn {
    background: linear-gradient(120deg, #2f6fe4, #4f8ff8);
    color: #f0e8d0;
    border: 1px solid #8ab4ff;
    border-radius: 999px;
    padding: 0.14rem 0.5rem;
    font-size: 0.68rem;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .board-and-panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .board-wrapper {
    flex: 1;
    position: relative;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  @media (min-width: 700px) {
    .board-and-panel {
      flex-direction: row;
    }
  }

  @media (max-width: 560px) {
    .conn-chip {
      padding: 0.08rem 0.34rem;
      font-size: 0.59rem;
    }

    .sync-meta {
      font-size: 0.58rem;
    }
  }

  .pending-overlay {
    position: fixed;
    bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
    left: 50%;
    transform: translateX(-50%);
    background: #2c5f2e;
    border: 1px solid #6dbf6d;
    border-radius: 10px;
    padding: 0.55rem 1rem;
    font-size: 0.82rem;
    color: #f5c842;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    z-index: 300;
    box-shadow: 0 2px 12px rgba(0,0,0,0.5);
  }
  .pending-overlay button {
    background: #3a5e1e;
    color: #f5c842;
    border: 1px solid #6dbf6d;
    border-radius: 6px;
    padding: 0.25rem 0.6rem;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
  }

  .confetti-overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 400;
    overflow: hidden;
  }

  .confetti-piece {
    position: absolute;
    top: -10px;
    left: var(--x);
    width: 8px;
    height: 12px;
    background: var(--c);
    border-radius: 2px;
    opacity: 0.9;
    animation: confetti-fall var(--d) ease-in forwards;
    animation-delay: calc(var(--i) * 0.08s);
  }

  .confetti-piece:nth-child(odd) {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  @keyframes confetti-fall {
    0% {
      transform: translateY(0) rotate(0deg);
      opacity: 1;
    }
    100% {
      transform: translateY(100vh) rotate(var(--r));
      opacity: 0;
    }
  }

  .victory-crown {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 4rem;
    animation: crown-bounce 600ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    filter: drop-shadow(0 4px 20px rgba(245, 200, 66, 0.5));
  }

  @keyframes crown-bounce {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.3);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .confetti-piece { animation: none; display: none; }
    .victory-crown { animation: none; }
  }

  .victory-banner {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 500;
    background: rgba(20, 40, 20, 0.96);
    border: 2px solid #f5c842;
    border-radius: 16px;
    padding: 2rem 2.5rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    box-shadow: 0 8px 48px rgba(0, 0, 0, 0.7);
  }

  .victory-crown-static {
    font-size: 3rem;
  }

  .victory-title {
    font-size: 1.6rem;
    font-weight: 800;
    color: #f5c842;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  }

  .return-lobby-btn {
    margin-top: 0.5rem;
    background: #f5c842;
    color: #1a2e0a;
    border: none;
    border-radius: 8px;
    padding: 0.6rem 1.4rem;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s;
  }

  .return-lobby-btn:hover {
    background: #ffe066;
  }
</style>
