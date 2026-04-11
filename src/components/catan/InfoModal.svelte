<script lang="ts">
  import Modal from "./Modal.svelte";
  import { store } from "../../lib/catan/store.svelte.js";
  import {
    BUILD_COST_HINTS,
    KNIGHT_LEVEL_HINTS,
    PROGRESS_CARD_INFO,
  } from "../../lib/catan/constants.js";
  import { CARD_EMOJI } from "./cardEmoji.js";
  import type { CommodityType, ResourceType } from "../../lib/catan/types.js";

  let modal = $derived(store.infoModal);
  let open = $state(false);

  $effect(() => {
    open = modal !== null;
  });

  $effect(() => {
    if (modal && !open) close();
  });

  const TRACK_BADGE_COLOR: Record<string, string> = {
    science: "#2e9e4f",
    trade: "#f1c232",
    politics: "#2f6fe4",
  };

  function close() {
    store.closeInfoModal();
  }

  const RESOURCE_OPTIONS: ResourceType[] = [
    "brick",
    "lumber",
    "ore",
    "grain",
    "wool",
  ];
  const COMMODITY_OPTIONS: CommodityType[] = ["cloth", "coin", "paper"];
  const CARD_TYPE_OPTIONS: Array<keyof typeof CARD_EMOJI> = [
    "brick",
    "lumber",
    "ore",
    "grain",
    "wool",
    "cloth",
    "coin",
    "paper",
  ];
  const CRANE_TRACK_OPTIONS = ["science", "trade", "politics"] as const;

  let selectedResource = $state<ResourceType>("grain");
  let selectedCommodity = $state<CommodityType>("cloth");
  let selectedCardType = $state<keyof typeof CARD_EMOJI>("cloth");
  let selectedCraneTrack = $state<(typeof CRANE_TRACK_OPTIONS)[number]>(
    "science",
  );
  let die1 = $state(1);
  let die2 = $state(1);

  function playProgress() {
    if (!modal || modal.kind !== "progress") return;
    const pid = store.localPid;
    if (!pid || !modal.canPlayNow) return;

    if (modal.card.name === "ResourceMonopoly") {
      store.sendAction({
        type: "PLAY_PROGRESS",
        pid,
        card: modal.card.name,
        params: { resource: selectedResource },
      });
      close();
      return;
    }

    if (modal.card.name === "TradeMonopoly") {
      store.sendAction({
        type: "PLAY_PROGRESS",
        pid,
        card: modal.card.name,
        params: { commodity: selectedCommodity },
      });
      close();
      return;
    }

    if (modal.card.name === "Alchemy") {
      store.sendAction({
        type: "PLAY_PROGRESS",
        pid,
        card: modal.card.name,
        params: { die1, die2 },
      });
      close();
      return;
    }

    if (modal.card.name === "MerchantFleet") {
      store.sendAction({
        type: "PLAY_PROGRESS",
        pid,
        card: modal.card.name,
        params: { cardType: selectedCardType },
      });
      close();
      return;
    }

    if (modal.card.name === "Crane") {
      store.sendAction({
        type: "PLAY_PROGRESS",
        pid,
        card: modal.card.name,
        params: { track: selectedCraneTrack },
      });
      close();
      return;
    }

    if (!PROGRESS_CARD_INFO[modal.card.name].requiresTarget) {
      store.sendAction({
        type: "PLAY_PROGRESS",
        pid,
        card: modal.card.name,
      });
      close();
    }
  }
</script>

{#if modal}
  <Modal bind:open={open} title={modal.kind === "progress" ? PROGRESS_CARD_INFO[modal.card.name].title : modal.kind === "build-costs" ? "Build Costs" : "Knight Levels"} closeOnBackdrop>
    {#if modal.kind === "progress"}
      {@const info = PROGRESS_CARD_INFO[modal.card.name]}
      <div class="track-badge" style={`background:${TRACK_BADGE_COLOR[modal.card.track] ?? "#4d5f4d"}`}>
        {modal.card.track.toUpperCase()}
      </div>
      <p class="short">{info.short}</p>
      <p class="effect">{info.effect}</p>
      <p class="helper">{modal.helperText}</p>
      {#if modal.canPlayNow && modal.card.name === "ResourceMonopoly"}
        <div class="picker-row">
          <label for="res-select">Resource</label>
          <select id="res-select" bind:value={selectedResource}>
            {#each RESOURCE_OPTIONS as option}
              <option value={option}>{CARD_EMOJI[option]} {option}</option>
            {/each}
          </select>
        </div>
      {:else if modal.canPlayNow && modal.card.name === "TradeMonopoly"}
        <div class="picker-row">
          <label for="com-select">Commodity</label>
          <select id="com-select" bind:value={selectedCommodity}>
            {#each COMMODITY_OPTIONS as option}
              <option value={option}>{CARD_EMOJI[option]} {option}</option>
            {/each}
          </select>
        </div>
      {:else if modal.canPlayNow && modal.card.name === "Alchemy"}
        <div class="picker-grid">
          <div class="picker-row">
            <label for="die-one">Die 1</label>
            <select id="die-one" bind:value={die1}>
              {#each [1, 2, 3, 4, 5, 6] as value}
                <option value={value}>{value}</option>
              {/each}
            </select>
          </div>
          <div class="picker-row">
            <label for="die-two">Die 2</label>
            <select id="die-two" bind:value={die2}>
              {#each [1, 2, 3, 4, 5, 6] as value}
                <option value={value}>{value}</option>
              {/each}
            </select>
          </div>
        </div>
      {:else if modal.canPlayNow && modal.card.name === "MerchantFleet"}
        <div class="picker-row">
          <label for="fleet-select">2:1 card type</label>
          <select id="fleet-select" bind:value={selectedCardType}>
            {#each CARD_TYPE_OPTIONS as option}
              <option value={option}>{CARD_EMOJI[option]} {option}</option>
            {/each}
          </select>
        </div>
      {:else if modal.canPlayNow && modal.card.name === "Crane"}
        <div class="picker-row">
          <label for="crane-select">Discount track</label>
          <select id="crane-select" bind:value={selectedCraneTrack}>
            {#each CRANE_TRACK_OPTIONS as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </div>
      {/if}
      <div class="actions">
        {#if modal.canPlayNow && (!info.requiresTarget || modal.card.name === "ResourceMonopoly" || modal.card.name === "TradeMonopoly" || modal.card.name === "Alchemy" || modal.card.name === "MerchantFleet" || modal.card.name === "Crane")}
          <button class="confirm" onclick={playProgress}>Use Card</button>
        {/if}
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
    gap: 0.45rem;
    margin-top: 0.8rem;
  }

  .picker-row {
    margin-top: 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .picker-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }

  .picker-row label {
    font-size: 0.72rem;
    text-transform: uppercase;
    color: #c8b47a;
    letter-spacing: 0.04em;
  }

  .picker-row select {
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: #1a2a1a;
    color: #f0e8d0;
    padding: 0.3rem 0.4rem;
    font-size: 0.82rem;
  }

  .confirm {
    background: #3a5e1e;
    color: #f5c842;
    border: 1px solid #6dbf6d;
    border-radius: 7px;
    padding: 0.4rem 0.75rem;
    font-size: 0.82rem;
    font-weight: 700;
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
