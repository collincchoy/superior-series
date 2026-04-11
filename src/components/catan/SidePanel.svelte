<script lang="ts">
  import type { GameState, PlayerId } from '../../lib/catan/types.js';
  import type { PendingAction } from '../../lib/catan/validTargets.js';
  import PhaseBanner from './PhaseBanner.svelte';
  import PlayersPanel from './PlayersPanel.svelte';
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
</script>

<div class="side-panel">
  <PhaseBanner {gameState} {localPid} />
  <PlayersPanel {gameState} {localPid} />
  <HandPanel {me} />
  {#if isMyTurn}
    <ActionPanel {gameState} {localPid} {pendingAction} bind:showTrade />
  {:else}
    <div class="action-panel"></div>
  {/if}
  <LogPanel log={gameState.log} />
</div>
