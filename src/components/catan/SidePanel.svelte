<script lang="ts">
  import type { GameState, PlayerId } from "../../lib/catan/types.js";
  import type { PendingAction } from "../../lib/catan/validTargets.js";
  import { isPlayerActing } from "../../lib/catan/turnActors.js";
  import PhaseBanner from "./PhaseBanner.svelte";
  import HandPanel from "./HandPanel.svelte";
  import ActionPanel from "./ActionPanel.svelte";
  import LogPanel from "./LogPanel.svelte";

  let {
    gameState,
    localPid,
    pendingAction,
    isMyTurn,
    showTrade = $bindable(false),
  }: {
    gameState: GameState;
    localPid: PlayerId;
    pendingAction: PendingAction | null;
    isMyTurn: boolean;
    showTrade: boolean;
  } = $props();

  let me = $derived(gameState.players[localPid]!);
  let canAct = $derived(isPlayerActing(gameState, localPid));
</script>

<div class="side-panel">
  <PhaseBanner {gameState} {localPid} />
  <HandPanel
    {me}
    phase={gameState.phase}
    canPlayProgress={
      canAct && (gameState.phase === "ACTION" || gameState.phase === "ROLL_DICE")
    }
  />
  {#if canAct}
    <ActionPanel {gameState} {localPid} {pendingAction} bind:showTrade />
  {:else}
    <div class="action-panel"></div>
  {/if}
  <LogPanel log={gameState.log} />
</div>

<style>
  .side-panel {
    flex-shrink: 0;
    max-height: 42vh;
    overflow-y: scroll;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    background: #1a2a1a;
    border-top: 2px solid #2c5f2e;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  /* Decorative dividers between panel sections */
  .side-panel :global(.hand-panel),
  .side-panel :global(.action-panel),
  .side-panel :global(.log-panel) {
    border-top: 1px solid #2c5f2e;
    position: relative;
  }

  .side-panel :global(.hand-panel)::before,
  .side-panel :global(.action-panel)::before,
  .side-panel :global(.log-panel)::before {
    content: "✦";
    position: absolute;
    top: -0.46em;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.5rem;
    color: #4a6e4a;
    background: #1a2a1a;
    padding: 0 0.4rem;
    line-height: 1;
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
