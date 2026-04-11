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

<DiscardModal {gameState} {localPid} />
{#if showTrade}
  <TradeBankModal {gameState} {localPid} bind:open={showTrade} />
{/if}
