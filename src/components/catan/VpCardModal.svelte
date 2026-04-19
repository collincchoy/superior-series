<script lang="ts">
  import type { GameState, PlayerId } from "../../lib/catan/types.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import Modal from "./Modal.svelte";
  import ProgressCardInfoView from "./ProgressCardInfoView.svelte";

  let { gameState, localPid }: { gameState: GameState; localPid: PlayerId } = $props();

  let pending = $derived(gameState.pendingVpCardAnnouncement);
  let open = $derived(pending?.pid === localPid);
  let card = $derived(pending?.card);
</script>

{#if open && card}
  <Modal {open} title="Victory Point Card!" closeable={false} closeOnBackdrop={false}>
    <div class="vp-card-reveal">
      <ProgressCardInfoView {card} />
      <div class="vp-badge">+1 VP</div>
    </div>
    <button
      class="place-btn"
      onclick={() => store.sendAction({ type: "ACKNOWLEDGE_VP_CARD", pid: localPid })}
    >
      Place Face-Up
    </button>
  </Modal>
{/if}

<style>
  .vp-card-reveal {
    border: 2px solid #d4af37;
    border-radius: 8px;
    padding: 0.9rem;
    margin-bottom: 0.9rem;
    background: rgba(212, 175, 55, 0.08);
    text-align: center;
  }

  .vp-badge {
    display: inline-block;
    background: #d4af37;
    color: #2d2100;
    font-weight: 700;
    font-size: 0.85rem;
    border-radius: 999px;
    padding: 0.2rem 0.7rem;
    margin-top: 0.6rem;
  }

  .place-btn {
    width: 100%;
    background: #3a5e1e;
    color: #f5c842;
    border: 1px solid #6dbf6d;
    border-radius: 7px;
    padding: 0.5rem 0.75rem;
    font-size: 0.88rem;
    font-weight: 700;
    cursor: pointer;
  }

  .place-btn:hover {
    background: #4a7a28;
  }
</style>
