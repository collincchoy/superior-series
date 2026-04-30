<script lang="ts">
  import type { GameState, PlayerId, Resources } from "../../lib/catan/types.js";
  import {
    COMMODITY_KEYS,
    RESOURCE_KEYS,
  } from "../../lib/catan/types.js";
  import { getBankRatio } from "../../lib/catan/rules.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import Modal from "./Modal.svelte";
  import ResourceKeyGrid from "./ResourceKeyGrid.svelte";

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
  let isTradeL3 = $derived(me.improvements.trade >= 3);

  let ratios = $derived.by(() => {
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
      r[key] = getBankRatio(me, gameState.board, key, gameState.progressEffects);
    }

    return r;
  });

  let canGive = $derived(
    RESOURCE_KEYS.filter((k) => me.resources[k] >= ratios[k]),
  );
  let canGiveCommodity2 = $derived(
    isTradeL3
      ? [...COMMODITY_KEYS].filter((k) => (me.resources[k] ?? 0) >= 2)
      : [],
  );
  let giveKey = $state<keyof Resources | null>(null);
  let giveCommodity2Key = $state<keyof Resources | null>(null);
  let getKey = $state<keyof Resources | null>(null);
  let mode = $state<"standard" | "commodity2">("standard");
  let canTrade = $derived(
    mode === "standard"
      ? !!giveKey && !!getKey && giveKey !== getKey
      : !!giveCommodity2Key && !!getKey && giveCommodity2Key !== getKey,
  );

  $effect(() => {
    if (open) {
      giveKey = null;
      giveCommodity2Key = null;
      getKey = null;
      mode = "standard";
    }
  });

  function confirm() {
    if (mode === "standard") {
      if (!giveKey || !getKey || giveKey === getKey) return;
      store.sendAction({
        type: "TRADE_BANK",
        pid: localPid,
        give: { [giveKey]: ratios[giveKey] },
        get: { [getKey]: 1 },
      });
    } else {
      if (!giveCommodity2Key || !getKey || giveCommodity2Key === getKey) return;
      store.sendAction({
        type: "TRADE_BANK",
        pid: localPid,
        give: { [giveCommodity2Key]: 2 },
        get: { [getKey]: 1 },
      });
    }
    open = false;
  }
</script>

<Modal bind:open title="Trade with Bank" closeOnBackdrop>
  {#if isTradeL3}
    <div class="mode-tabs">
      <button
        class="tab-btn"
        class:active={mode === "standard"}
        onclick={() => {
          mode = "standard";
          giveKey = null;
          giveCommodity2Key = null;
          getKey = null;
        }}
      >Standard</button>
      <button
        class="tab-btn"
        class:active={mode === "commodity2"}
        onclick={() => {
          mode = "commodity2";
          giveKey = null;
          giveCommodity2Key = null;
          getKey = null;
        }}
      >🤝 Level 3: 2 commodities</button>
    </div>
  {/if}

  {#if mode === "standard"}
    <div class="section">
      <span class="field-label" id="bank-give-std">Give (× ratio)</span>
      {#if canGive.length === 0}
        <span class="empty">Not enough resources</span>
      {:else}
        <ResourceKeyGrid
          labelledby="bank-give-std"
          keys={canGive}
          selected={giveKey}
          suffixFor={(k) => `×${ratios[k]}`}
          onSelect={(k) => (giveKey = k)}
        />
      {/if}
    </div>
  {:else}
    <div class="section">
      <span class="field-label" id="bank-give-com">Give 2 matching commodities</span>
      {#if canGiveCommodity2.length === 0}
        <span class="empty">Need 2+ of any commodity</span>
      {:else}
        <ResourceKeyGrid
          labelledby="bank-give-com"
          keys={canGiveCommodity2}
          selected={giveCommodity2Key}
          suffixFor={() => "×2"}
          onSelect={(k) => (giveCommodity2Key = k)}
        />
      {/if}
    </div>
  {/if}

  <div class="section">
    <span class="field-label" id="bank-receive">Receive</span>
    <ResourceKeyGrid
      labelledby="bank-receive"
      keys={[...RESOURCE_KEYS]}
      selected={getKey}
      onSelect={(k) => (getKey = k)}
    />
  </div>
  <div class="actions">
    <button class="btn-primary" onclick={confirm} disabled={!canTrade}>Trade</button>
  </div>
</Modal>

<style>
  .mode-tabs {
    display: flex;
    gap: 0.3rem;
    margin-bottom: 0.7rem;
  }

  .tab-btn {
    flex: 1;
    background: rgba(255, 255, 255, 0.06);
    color: #a0b0a0;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 5px;
    padding: 0.3rem 0.5rem;
    font-size: 0.76rem;
    cursor: pointer;
  }

  .tab-btn.active {
    background: #3a5e1e;
    color: #f0e8d0;
    border-color: #6dbf6d;
  }

  .section {
    margin-bottom: 0.8rem;
  }

  .field-label {
    display: block;
    font-size: 0.8rem;
    color: #c8b47a;
    margin-bottom: 0.35rem;
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
