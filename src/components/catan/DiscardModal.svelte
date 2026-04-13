<script lang="ts">
  import type {
    GameState,
    PlayerId,
    Resources,
  } from "../../lib/catan/types.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import { RESOURCE_KEYS } from "./cardEmoji.js";
  import DeltaChip from "./DeltaChip.svelte";
  import Modal from "./Modal.svelte";
  import ResourcePill from "./ResourcePill.svelte";

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

  function selectedCount(k: keyof Resources): number {
    return selected[k] ?? 0;
  }

  function handCount(k: keyof Resources): number {
    return Math.max(0, me.resources[k] - selectedCount(k));
  }

  function adjust(k: keyof Resources, dir: number) {
    const cur = selected[k] ?? 0;
    if (dir > 0) {
      if (selectedTotal >= needed || handCount(k) <= 0) return;
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

  <div class="transfer-layout">
    <section class="pane">
      <div class="pane-title">To discard</div>
      <div class="pill-grid">
        {#each RESOURCE_KEYS as k}
          {#if selectedCount(k) > 0}
            <button
              type="button"
              class="discard-pill"
              onclick={() => adjust(k, -1)}
              aria-label={`Remove ${k} from discard`}
            >
              <ResourcePill resource={k} count={selectedCount(k)} />
            </button>
          {/if}
        {/each}
        {#if selectedTotal === 0}
          <div class="empty">No cards selected yet.</div>
        {/if}
      </div>
    </section>

    <section class="pane">
      <div class="pane-title">Your hand</div>
      <div class="pill-grid">
        {#each RESOURCE_KEYS as k}
          {#if me.resources[k] > 0}
            <ResourcePill
              resource={k}
              count={handCount(k)}
              interactive
              touch
              muted={handCount(k) === 0}
              disabled={handCount(k) === 0 || selectedTotal >= needed}
              title={`Add ${k} to discard`}
              onclick={() => adjust(k, 1)}
            />
          {/if}
        {/each}
      </div>
    </section>
  </div>

  <div class="actions-row">
    <div class="tally" aria-live="polite">Selected: {selectedTotal} / {needed}</div>
    <button
      class="btn-primary"
      onclick={confirm}
      disabled={selectedTotal !== needed}>Discard</button
    >
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

  .transfer-layout {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    margin-bottom: 0.75rem;
  }

  .pane {
    border: 1px solid rgba(109, 191, 109, 0.24);
    border-radius: 10px;
    padding: 0.45rem;
    background: rgba(7, 30, 10, 0.5);
  }

  .pane-title {
    font-size: 0.73rem;
    text-transform: uppercase;
    color: #c8b47a;
    margin-bottom: 0.35rem;
    letter-spacing: 0.03em;
  }

  .pill-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    min-height: 2.5rem;
    align-content: flex-start;
  }

  .discard-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 10px;
    padding: 0.16rem 0.2rem;
    background: rgba(55, 20, 20, 0.3);
    cursor: pointer;
    min-height: 42px;
  }

  .discard-pill:hover {
    filter: brightness(1.07);
  }

  .discard-pill:active {
    transform: scale(0.98);
  }

  .empty {
    color: #a0b0a0;
    font-size: 0.82rem;
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
    .transfer-layout {
      gap: 0.5rem;
    }

    .pane {
      padding: 0.5rem;
    }

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

  @media (prefers-reduced-motion: reduce) {
    .discard-pill {
      transition: none;
    }

    .discard-pill:hover,
    .discard-pill:active {
      filter: none;
      transform: none;
    }
  }
</style>
