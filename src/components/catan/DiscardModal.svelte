<script lang="ts">
  import type {
    GameState,
    PlayerId,
    Resources,
  } from "../../lib/catan/types.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import { CARD_EMOJI, RESOURCE_KEYS } from "./cardEmoji.js";
  import Modal from "./Modal.svelte";

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

  function adjust(k: keyof Resources, dir: number) {
    const cur = selected[k] ?? 0;
    if (dir > 0 && selectedTotal >= needed) return;
    selected[k] = Math.max(0, Math.min(me.resources[k], cur + dir));
  }

  function confirm() {
    if (selectedTotal !== needed) return;
    store.sendAction({ type: "DISCARD", pid: localPid, cards: selected });
  }
</script>

<Modal {open} title="Discard {needed} cards">
  <div class="grid">
    {#each RESOURCE_KEYS as k}
      {#if me.resources[k] > 0}
        <div class="row">
          <span>{CARD_EMOJI[k]} {k} ({me.resources[k]})</span>
          <div class="counter">
            <button class="cnt-btn" onclick={() => adjust(k, -1)}>−</button>
            <span>{selected[k] ?? 0}</span>
            <button class="cnt-btn" onclick={() => adjust(k, 1)}>+</button>
          </div>
        </div>
      {/if}
    {/each}
  </div>
  <div class="tally">Selected: {selectedTotal} / {needed}</div>
  <button
    class="btn-primary"
    onclick={confirm}
    disabled={selectedTotal !== needed}>Discard</button
  >
</Modal>

<style>
  .grid {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.8rem;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.9rem;
  }

  .counter {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .cnt-btn {
    background: rgba(255, 255, 255, 0.1);
    color: #f0e8d0;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    width: 28px;
    height: 28px;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
  }

  .tally {
    margin-bottom: 0.8rem;
    font-size: 0.85rem;
    color: #c8b47a;
  }

  .btn-primary {
    background: #8b6914;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 0.6rem 1.2rem;
    font-size: 0.95rem;
    cursor: pointer;
    font-weight: 600;
  }
  .btn-primary:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
