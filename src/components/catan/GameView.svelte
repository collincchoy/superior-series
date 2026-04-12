<script lang="ts">
  import type { GameState, PlayerId } from "../../lib/catan/types.js";
  import type { PendingAction } from "../../lib/catan/validTargets.js";
  import { isPlayerActing } from "../../lib/catan/turnActors.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import BoardCanvas from "./BoardCanvas.svelte";
  import SidePanel from "./SidePanel.svelte";
  import PlayersPanel from "./PlayersPanel.svelte";
  import DiscardModal from "./DiscardModal.svelte";
  import TradeBankModal from "./TradeBankModal.svelte";
  import InfoModal from "./InfoModal.svelte";
  import CommercialHarborModal from "./CommercialHarborModal.svelte";

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
</script>

<div class="game-layout">
  {#if roomCode}
    <div class="room-code-banner">Room: <strong>{roomCode}</strong></div>
  {/if}
  <PlayersPanel {gameState} {localPid} />
  <div class="board-and-panel">
    <BoardCanvas {gameState} {localPid} {pendingAction} />
    <SidePanel
      {gameState}
      {localPid}
      {pendingAction}
      {isMyTurn}
      bind:showTrade
    />
  </div>
</div>

<DiscardModal {gameState} {localPid} />
{#if showTrade}
  <TradeBankModal {gameState} {localPid} bind:open={showTrade} />
{/if}
<CommercialHarborModal {gameState} {localPid} />
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
<InfoModal />

<style>
  .game-layout {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .room-code-banner {
    background: #2c5f2e;
    text-align: center;
    padding: 0.3rem 1rem;
    font-size: 0.8rem;
    color: #c8f5c8;
    flex-shrink: 0;
  }

  .board-and-panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  @media (min-width: 700px) {
    .board-and-panel {
      flex-direction: row;
    }
  }

  .pending-overlay {
    position: fixed;
    bottom: 1rem;
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
</style>
