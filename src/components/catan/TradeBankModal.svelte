<script lang="ts">
  import type {
    GameState,
    PlayerId,
    Resources,
  } from "../../lib/catan/types.js";
  import { getBankRatio } from "../../lib/catan/rules.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import { CARD_EMOJI, RESOURCE_KEYS } from "./cardEmoji.js";
  import Modal from "./Modal.svelte";

  let {
    gameState,
    localPid,
    open = $bindable(),
  }: {
    gameState: GameState;
    localPid: PlayerId;
    open: boolean;
  } = $props();

  let me = $derived(gameState.players[localPid]!);

  let ratios = $derived(() => {
    const r: Record<keyof Resources, number> = {
      brick: 4,
      lumber: 4,
      ore: 4,
      grain: 4,
      wool: 4,
      cloth: 4,
      coin: 4,
      paper: 4,
    };

    for (const key of RESOURCE_KEYS) {
      r[key] = getBankRatio(me, gameState.board, key);
    }

    const fleet = gameState.progressEffects.merchantFleet;
    if (fleet && fleet.playerId === localPid) {
      r[fleet.cardType] = Math.min(r[fleet.cardType], 2);
    }

    return r;
  });

  let canGive = $derived(
    RESOURCE_KEYS.filter((k) => me.resources[k] >= ratios()[k]),
  );
  let giveKey = $state<keyof Resources | null>(null);
  let getKey = $state<keyof Resources | null>(null);
  let canTrade = $derived(!!giveKey && !!getKey && giveKey !== getKey);

  $effect(() => {
    if (open) {
      giveKey = null;
      getKey = null;
    }
  });

  function confirm() {
    if (!giveKey || !getKey || giveKey === getKey) return;
    store.sendAction({
      type: "TRADE_BANK",
      pid: localPid,
      give: { [giveKey]: ratios()[giveKey] },
      get: { [getKey]: 1 },
    });
    open = false;
  }
</script>

<Modal bind:open title="Trade with Bank" closeOnBackdrop>
  <div class="section">
    <div class="field-label">Give (x ratio):</div>
    <div class="options">
      {#each canGive as k}
        <button
          class="card-btn"
          class:selected={giveKey === k}
          onclick={() => (giveKey = k)}
        >
          {CARD_EMOJI[k]}
          {k}×{ratios()[k]}
        </button>
      {/each}
      {#if canGive.length === 0}
        <span class="empty">Not enough resources</span>
      {/if}
    </div>
  </div>
  <div class="section">
    <div class="field-label">Receive:</div>
    <div class="options">
      {#each RESOURCE_KEYS as k}
        <button
          class="card-btn"
          class:selected={getKey === k}
          onclick={() => (getKey = k)}
        >
          {CARD_EMOJI[k]}
          {k}
        </button>
      {/each}
    </div>
  </div>
  <div class="actions">
    <button class="btn-primary" onclick={confirm} disabled={!canTrade}
      >Trade</button
    >
  </div>
</Modal>

<style>
  .section {
    margin-bottom: 0.8rem;
  }

  .field-label {
    display: block;
    font-size: 0.8rem;
    color: #c8b47a;
    margin-bottom: 0.3rem;
  }

  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .card-btn {
    background: rgba(255, 255, 255, 0.08);
    color: #f0e8d0;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 5px;
    padding: 0.35rem 0.6rem;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .card-btn.selected {
    background: #3a5e1e;
    border-color: #6dbf6d;
  }

  .empty {
    color: #a0b0a0;
    font-size: 0.8rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.8rem;
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
