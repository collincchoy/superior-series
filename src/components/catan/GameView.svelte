<script lang="ts">
  import type { GameState, PlayerId } from '../../lib/catan/types.js';
  import type { PendingAction } from '../../lib/catan/validTargets.js';
  import BoardCanvas from './BoardCanvas.svelte';
  import SidePanel from './SidePanel.svelte';
  import DiscardModal from './DiscardModal.svelte';

  let { gameState, localPid, pendingAction, roomCode }: {
    gameState: GameState;
    localPid: PlayerId;
    pendingAction: PendingAction | null;
    roomCode: string | null;
  } = $props();

  let isMyTurn = $derived(gameState.currentPlayerId === localPid);
</script>

<div class="game-layout">
  {#if roomCode}
    <div class="room-code-banner">Room: <strong>{roomCode}</strong></div>
  {/if}
  <BoardCanvas {gameState} {localPid} {pendingAction} />
  <SidePanel {gameState} {localPid} {pendingAction} {isMyTurn} />
</div>

<DiscardModal {gameState} {localPid} />
