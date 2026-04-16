<script lang="ts">
  import type { GameState, PlayerId } from "../../lib/catan/types.js";
  import type { PendingAction } from "../../lib/catan/validTargets.js";
  import { isPlayerActing } from "../../lib/catan/turnActors.js";
  import { store } from "../../lib/catan/store.svelte.js";
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
    showPlayerTrade = $bindable(false),
  }: {
    gameState: GameState;
    localPid: PlayerId;
    pendingAction: PendingAction | null;
    isMyTurn: boolean;
    showTrade: boolean;
    showPlayerTrade: boolean;
  } = $props();

  let me = $derived(gameState.players[localPid]!);
  let canAct = $derived(isPlayerActing(gameState, localPid));
  let pendingTrade = $derived(gameState.pendingTradeOffer);
  let waitingForTradeResponse = $derived(pendingTrade?.initiatorPid === localPid);
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
    <ActionPanel {gameState} {localPid} {pendingAction} bind:showTrade bind:showPlayerTrade />
  {:else if waitingForTradeResponse && pendingTrade}
    <div class="action-panel trade-waiting-panel">
      <p class="trade-wait-msg">⏳ Waiting for responses…</p>
      <div class="trade-wait-targets">
        {#each pendingTrade.targetPids as pid}
          <span class="target-chip" style="color:{gameState.players[pid]?.color}">
            {gameState.players[pid]?.name}
          </span>
        {/each}
      </div>
      <button
        class="cancel-offer-btn"
        onclick={() => store.sendAction({ type: "TRADE_CANCEL", from: localPid, to: pendingTrade!.targetPids[0]! })}
      >
        Cancel Offer
      </button>
    </div>
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

  .trade-waiting-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0.8rem 1rem;
  }

  .trade-wait-msg {
    margin: 0;
    font-size: 0.85rem;
    color: #c8b47a;
    text-align: center;
  }

  .trade-wait-targets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    justify-content: center;
  }

  .target-chip {
    font-size: 0.78rem;
    font-weight: 600;
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 999px;
    padding: 0.1rem 0.5rem;
  }

  .cancel-offer-btn {
    background: rgba(255, 255, 255, 0.08);
    color: #f0e8d0;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 5px;
    padding: 0.3rem 0.8rem;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .cancel-offer-btn:hover {
    background: rgba(255, 255, 255, 0.15);
  }
</style>
