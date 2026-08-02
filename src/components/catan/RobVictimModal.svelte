<script lang="ts">
  import type { GameState, PlayerId } from "../../lib/catan/types.js";
  import type { PendingAction } from "../../lib/catan/validTargets.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import { isPlayerActing } from "../../lib/catan/turnActors.js";
  import Modal from "./Modal.svelte";
  import PlayerChipBar from "./PlayerChipBar.svelte";

  let {
    gameState,
    localPid,
    pendingAction,
  }: {
    gameState: GameState;
    localPid: PlayerId;
    pendingAction: PendingAction | null;
  } = $props();

  let open = $derived(
    pendingAction?.type === "robber_select_victim" ||
      pendingAction?.type === "chase_robber_select_victim",
  );
  let isActing = $derived(isPlayerActing(gameState, localPid));

  let victims = $derived.by(() => {
    if (pendingAction?.type === "robber_select_victim") return pendingAction.victims;
    if (pendingAction?.type === "chase_robber_select_victim") return pendingAction.victims;
    return [] as PlayerId[];
  });

  let selectedTargetPid = $state<PlayerId | null>(null);

  $effect(() => {
    if (!open) {
      selectedTargetPid = null;
      return;
    }
    if (!victims.includes(selectedTargetPid as PlayerId)) {
      selectedTargetPid = victims[0] ?? null;
    }
  });

  function confirm() {
    if (!selectedTargetPid) return;
    const pa = pendingAction;
    if (!pa) return;
    if (pa.type === "robber_select_victim") {
      store.setPendingAction(null);
      store.sendAction({
        type: "MOVE_ROBBER",
        pid: localPid,
        hid: pa.hid,
        stealFrom: selectedTargetPid,
      });
      return;
    }
    if (pa.type === "chase_robber_select_victim") {
      store.setPendingAction(null);
      store.sendAction({
        type: "CHASE_ROBBER",
        pid: localPid,
        knight: pa.knight,
        hid: pa.hid,
        stealFrom: selectedTargetPid,
      });
    }
  }
</script>

<Modal {open} title="Choose player to rob" closeable={false} closeOnBackdrop={false}>
  {#if isActing}
    <p class="hint">Select one adjacent player with cards to steal from.</p>
    <PlayerChipBar
      mode="single"
      playerIds={victims}
      {gameState}
      bind:selectedSingle={selectedTargetPid}
    />
    <div class="actions-row">
      <button class="btn-primary" onclick={confirm} disabled={!selectedTargetPid}>
        Rob Selected Player
      </button>
    </div>
  {:else}
    <p class="hint">Waiting for the active player to choose who to rob.</p>
  {/if}
</Modal>

<style>
  .hint {
    margin: 0 0 0.6rem;
    color: #c8b47a;
    font-size: 0.9rem;
  }

  .actions-row {
    margin-top: 0.9rem;
    display: flex;
    justify-content: flex-end;
  }

  .btn-primary {
    background: #8b6914;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 0.65rem 1.1rem;
    min-height: 42px;
    font-size: 0.95rem;
    cursor: pointer;
    font-weight: 600;
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: default;
  }

  @media (max-width: 720px) {
    .actions-row {
      justify-content: stretch;
    }

    .btn-primary {
      width: 100%;
    }
  }
</style>
