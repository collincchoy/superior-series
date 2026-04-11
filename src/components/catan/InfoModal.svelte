<script lang="ts">
  import Modal from "./Modal.svelte";
  import { store } from "../../lib/catan/store.svelte.js";
  import {
    BUILD_COST_HINTS,
    KNIGHT_LEVEL_HINTS,
    PROGRESS_CARD_INFO,
  } from "../../lib/catan/constants.js";
  import { CARD_EMOJI } from "./cardEmoji.js";

  let modal = $derived(store.infoModal);
  let open = $derived(modal !== null);

  const TRACK_BADGE_COLOR: Record<string, string> = {
    science: "#2f6fe4",
    trade: "#2e9e4f",
    politics: "#f1c232",
  };

  function close() {
    store.closeInfoModal();
  }
</script>

{#if modal}
  <Modal open={open} title={modal.kind === "progress" ? PROGRESS_CARD_INFO[modal.card.name].title : modal.kind === "build-costs" ? "Build Costs" : "Knight Levels"} closeOnBackdrop>
    {#if modal.kind === "progress"}
      {@const info = PROGRESS_CARD_INFO[modal.card.name]}
      <div class="track-badge" style={`background:${TRACK_BADGE_COLOR[modal.card.track] ?? "#4d5f4d"}`}>
        {modal.card.track.toUpperCase()}
      </div>
      <p class="short">{info.short}</p>
      <p class="effect">{info.effect}</p>
      <p class="helper">{modal.helperText}</p>
      <div class="actions">
        <button class="cancel" onclick={close}>Close</button>
      </div>
    {:else if modal.kind === "build-costs"}
      <div class="hint-list">
        {#each BUILD_COST_HINTS as row}
          <div class="hint-row">
            <span class="name">{row.label}</span>
            <span class="cost">
              {#each Object.entries(row.cost) as [key, value]}
                <span class="chip">{CARD_EMOJI[key as keyof typeof CARD_EMOJI]}x{value}</span>
              {/each}
            </span>
          </div>
        {/each}
      </div>
      <div class="actions">
        <button class="cancel" onclick={close}>Close</button>
      </div>
    {:else}
      <div class="hint-list">
        {#each [1, 2, 3] as level}
          {@const item = KNIGHT_LEVEL_HINTS[level as 1 | 2 | 3]}
          <div class="knight-row">
            <div class="name">{item.name}</div>
            <div class="desc">{item.text}</div>
          </div>
        {/each}
      </div>
      <div class="actions">
        <button class="cancel" onclick={close}>Close</button>
      </div>
    {/if}
  </Modal>
{/if}

<style>
  .track-badge {
    display: inline-block;
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
    color: #fff;
    margin-bottom: 0.45rem;
  }

  .short {
    margin: 0;
    font-size: 0.9rem;
    color: #f7efdc;
    line-height: 1.35;
    font-weight: 700;
  }

  .effect {
    margin: 0.45rem 0 0;
    font-size: 0.82rem;
    color: #d6d8cd;
    line-height: 1.35;
  }

  .helper {
    margin: 0.6rem 0 0;
    font-size: 0.76rem;
    color: #c8b47a;
    line-height: 1.35;
  }

  .hint-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .hint-row {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 8px;
    padding: 0.5rem;
  }

  .hint-row .name {
    font-size: 0.85rem;
    color: #f5c842;
    font-weight: 700;
  }

  .cost {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .chip {
    font-size: 0.75rem;
    background: rgba(255, 255, 255, 0.09);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    padding: 0.12rem 0.35rem;
  }

  .knight-row {
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 8px;
    padding: 0.5rem;
  }

  .knight-row .name {
    font-size: 0.84rem;
    font-weight: 700;
    color: #f5c842;
  }

  .knight-row .desc {
    margin-top: 0.18rem;
    font-size: 0.76rem;
    line-height: 1.33;
    color: #d6d8cd;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.8rem;
  }

  .cancel {
    background: #314531;
    color: #f0e8d0;
    border: 1px solid #507250;
    border-radius: 7px;
    padding: 0.4rem 0.75rem;
    font-size: 0.82rem;
    font-weight: 700;
  }
</style>
