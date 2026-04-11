<script lang="ts">
  import type { GameState, PlayerId } from '../../lib/catan/types.js';
  import type { PendingAction } from '../../lib/catan/validTargets.js';
  import BoardCanvas from './BoardCanvas.svelte';
  import SidePanel from './SidePanel.svelte';
  import PlayersPanel from './PlayersPanel.svelte';
  import DiscardModal from './DiscardModal.svelte';
  import TradeBankModal from './TradeBankModal.svelte';

  let { gameState, localPid, pendingAction, roomCode }: {
    gameState: GameState;
    localPid: PlayerId;
    pendingAction: PendingAction | null;
    roomCode: string | null;
  } = $props();

  let isMyTurn = $derived(gameState.currentPlayerId === localPid);
  let showTrade = $state(false);
</script>

<div class="game-layout">
  {#if roomCode}
    <div class="room-code-banner">Room: <strong>{roomCode}</strong></div>
  {/if}
  <PlayersPanel {gameState} {localPid} />
  <div class="board-and-panel">
    <BoardCanvas {gameState} {localPid} {pendingAction} />
    <SidePanel {gameState} {localPid} {pendingAction} {isMyTurn} bind:showTrade />
  </div>
</div>

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
</style>

<DiscardModal {gameState} {localPid} />
{#if showTrade}
  <TradeBankModal {gameState} {localPid} bind:open={showTrade} />
{/if}
