<script lang="ts">
  import type { GameState, PlayerId } from '../../lib/catan/types.js';
  import type { PendingAction } from '../../lib/catan/validTargets.js';
  import PhaseBanner from './PhaseBanner.svelte';
  import HandPanel from './HandPanel.svelte';
  import ActionPanel from './ActionPanel.svelte';
  import LogPanel from './LogPanel.svelte';

  let { gameState, localPid, pendingAction, isMyTurn, showTrade = $bindable(false) }: {
    gameState: GameState;
    localPid: PlayerId;
    pendingAction: PendingAction | null;
    isMyTurn: boolean;
    showTrade: boolean;
  } = $props();

  let me = $derived(gameState.players[localPid]!);
  let needsProgressDraw = $derived(
    gameState.phase === 'RESOLVE_PROGRESS_DRAW' &&
    (gameState.pendingProgressDraw?.remaining ?? []).includes(localPid)
  );
</script>

<div class="side-panel">
  <PhaseBanner {gameState} {localPid} />
  <HandPanel {me} />
  {#if isMyTurn || needsProgressDraw}
    <ActionPanel {gameState} {localPid} {pendingAction} bind:showTrade />
  {:else}
    <div class="action-panel"></div>
  {/if}
  <LogPanel log={gameState.log} />
</div>

<style>
  .side-panel {
    flex-shrink: 0;
    max-height: 45vh;
    overflow-y: scroll;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    background: #1a2a1a;
    border-top: 2px solid #2c5f2e;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  @media (min-width: 700px) {
    .side-panel {
      width: 260px;
      max-height: unset;
      border-top: none;
      border-left: 2px solid #2c5f2e;
      overflow-y: auto;
    }
  }
</style>
