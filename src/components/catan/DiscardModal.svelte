<script lang="ts">
  import type {
    GameState,
    PlayerId,
    Resources,
  } from "../../lib/catan/types.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import DeltaChip from "./DeltaChip.svelte";
  import Modal from "./Modal.svelte";
  import ResourceHandPicker from "./ResourceHandPicker.svelte";

  let { gameState, localPid }: { gameState: GameState; localPid: PlayerId } =
    $props();

  let needed = $derived(gameState.pendingDiscard?.remaining[localPid] ?? 0);
  let open = $derived(gameState.phase === "DISCARD" && needed > 0);
  let me = $derived(gameState.players[localPid]!);

  let selected = $state<Partial<Resources>>({});
  $effect(() => {
    if (open) selected = {};
  });

  let selectedTotal = $derived(
    Object.values(selected).reduce((a, b) => a + (b ?? 0), 0),
  );

  let remaining = $derived(Math.max(0, needed - selectedTotal));

  function adjust(k: keyof Resources, dir: number) {
    const cur = selected[k] ?? 0;
    if (dir > 0) {
      const remaining = Math.max(0, (me.resources[k] ?? 0) - cur);
      if (selectedTotal >= needed || remaining <= 0) return;
      selected[k] = cur + 1;
      return;
    }

    if (cur <= 0) return;
    selected[k] = cur - 1;
    if (selected[k] === 0) {
      delete selected[k];
    }
  }

  function confirm() {
    if (selectedTotal !== needed) return;
    store.sendAction({ type: "DISCARD", pid: localPid, cards: selected });
  }
</script>

<Modal {open} title="Discard {needed} cards" closeable={false} closeOnBackdrop={false}>
  <div class="top-row">
    <p class="hint">Tap cards in your hand to move them into discard.</p>
    {#if remaining > 0}
      <DeltaChip kind="progress" amount={-remaining} />
    {/if}
  </div>

  <ResourceHandPicker
    selectedLabel="To discard"
    handLabel="Your hand"
    selected={selected}
    hand={me.resources}
    onAdjust={(k, dir) => adjust(k, dir)}
    maxTotal={needed}
  />

  <div class="actions-row">
    <div class="tally" aria-live="polite">Selected: {selectedTotal} / {needed}</div>
    <button
      class="btn-primary"
      onclick={confirm}
      disabled={selectedTotal !== needed}
    >
      Discard
    </button>
  </div>
</Modal>

<style>
  .top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    margin-bottom: 0.65rem;
  }

  .hint {
    margin: 0;
    font-size: 0.82rem;
    color: #c8b47a;
  }

  .actions-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.7rem;
  }

  .tally {
    font-size: 0.9rem;
    color: #c8b47a;
  }

  .btn-primary {
    background: #8b6914;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 0.7rem 1.35rem;
    min-height: 44px;
    font-size: 1rem;
    cursor: pointer;
    font-weight: 600;
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: default;
  }

  @media (max-width: 720px) {
    .actions-row {
      flex-direction: column;
      align-items: stretch;
    }

    .tally {
      text-align: center;
    }

    .btn-primary {
      width: 100%;
    }
  }

</style>
