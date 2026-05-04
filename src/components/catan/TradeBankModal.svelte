<script lang="ts">
  import type { GameState, PlayerId, Resources } from "../../lib/catan/types.js";
  import { COMMODITY_KEYS, RESOURCE_KEYS } from "../../lib/catan/types.js";
  import { getBankRatio } from "../../lib/catan/rules.js";
  import { bankRemaining } from "../../lib/catan/game.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import Modal from "./Modal.svelte";
  import ResourceCard from "./ResourceCard.svelte";
  import ResourceKeyGrid from "./ResourceKeyGrid.svelte";
  import { CARD_EMOJI } from "./cardEmoji.js";

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
  let bank = $derived(bankRemaining(gameState));
  let isTradeL3 = $derived(me.improvements.trade >= 3);
  type GiveOption = { amount: number; suffix: string };
  let playerVertices = $derived.by(() => {
    return new Set(
      Object.entries(gameState.board.vertices)
        .filter(([, b]) => b?.playerId === localPid)
        .map(([vid]) => vid),
    );
  });
  let hasGenericHarbor = $derived.by(() => {
    return gameState.board.harbors.some((harbor) => {
      if (harbor.type !== "generic") return false;
      const [v1, v2] = harbor.vertices;
      return playerVertices.has(v1) || playerVertices.has(v2);
    });
  });

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

  let giveOptions = $derived.by(() => {
    const options: Partial<Record<keyof Resources, GiveOption>> = {};
    for (const key of RESOURCE_KEYS) {
      const ratio = ratios[key];
      if (me.resources[key] >= ratio) {
        options[key] = { amount: ratio, suffix: `×${ratio}` };
      }
    }
    if (isTradeL3) {
      for (const key of COMMODITY_KEYS) {
        if ((me.resources[key] ?? 0) >= 2) {
          options[key] = { amount: 2, suffix: "×2" };
        }
      }
    }
    return options;
  });
  let giveKeys = $derived(
    RESOURCE_KEYS.filter((k) => giveOptions[k] !== undefined),
  );
  let resourceTwoToOneDeals = $derived(
    RESOURCE_KEYS.filter((k) => ratios[k] === 2),
  );
  let baseAllRatio = $derived(hasGenericHarbor ? 3 : 4);
  let giveKey = $state<keyof Resources | null>(null);
  let getKey = $state<keyof Resources | null>(null);
  let selectedGive = $derived(giveKey ? giveOptions[giveKey] ?? null : null);
  let canReceive = $derived(getKey !== null && bank[getKey] > 0);
  let canTrade = $derived(
    !!giveKey && !!selectedGive && canReceive && giveKey !== getKey,
  );

  $effect(() => {
    if (open) {
      giveKey = null;
      getKey = null;
    }
  });

  function confirm() {
    if (!giveKey || !selectedGive || !getKey || giveKey === getKey) return;
    store.sendAction({
      type: "TRADE_BANK",
      pid: localPid,
      give: { [giveKey]: selectedGive.amount },
      get: { [getKey]: 1 },
    });
    open = false;
  }
</script>

<Modal bind:open title="Trade with Bank" closeOnBackdrop>
  <div class="section">
    <div class="give-header">
      <span class="field-label" id="bank-give">Give</span>
      <div class="deal-chip-row" aria-label="Bank trade deals">
        <div class="deal-chip">
          <span class="deal-chip-label">ALL</span>
          <span class="deal-chip-ratio">{baseAllRatio}:1</span>
        </div>
        {#each resourceTwoToOneDeals as key (key)}
          <div class="deal-chip">
            <span class="deal-chip-label">
              <span aria-hidden="true">{CARD_EMOJI[key]}</span>
              <span>{key}</span>
            </span>
            <span class="deal-chip-ratio">2:1</span>
          </div>
        {/each}
        {#if isTradeL3}
          <div class="deal-chip">
            <span class="deal-chip-label">cloth/coin/paper</span>
            <span class="deal-chip-ratio">2:1</span>
          </div>
        {/if}
      </div>
    </div>
    {#if giveKeys.length === 0}
      <span class="empty">Not enough resources</span>
    {:else}
      <ResourceKeyGrid
        labelledby="bank-give"
        keys={giveKeys}
        selected={giveKey}
        suffixFor={(k) => giveOptions[k]?.suffix ?? ""}
        onSelect={(k) => (giveKey = k)}
      />
    {/if}
  </div>

  <div class="section bank-section">
    <span class="field-label">Receive</span>
    <div class="bank-cards">
      {#each RESOURCE_KEYS as k (k)}
        <ResourceCard
          cardKey={k}
          count={bank[k]}
          disabled={bank[k] <= 0}
          selected={getKey === k}
          onclick={() => (getKey = k)}
        />
      {/each}
    </div>
  </div>
  <div class="actions">
    <button class="btn-primary" onclick={confirm} disabled={!canTrade}>Trade</button>
  </div>
</Modal>

<style>
  .section {
    margin-bottom: 0.8rem;
  }

  .deal-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.28rem;
    margin-bottom: 0.2rem;
  }

  .give-header {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex-wrap: wrap;
    margin-bottom: 0.2rem;
  }

  .give-header .deal-chip-row {
    margin-left: auto;
    justify-content: flex-end;
  }

  .deal-chip {
    display: flex;
    align-items: center;
    gap: 0.24rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 999px;
    padding: 0.1rem 0.14rem 0.1rem 0.34rem;
    background: rgba(255, 255, 255, 0.05);
  }

  .deal-chip-label {
    display: inline-flex;
    align-items: center;
    gap: 0.16rem;
    color: #e8eddc;
    font-size: 0.64rem;
    line-height: 1.1;
    text-transform: capitalize;
    white-space: nowrap;
  }

  .deal-chip-ratio {
    border-radius: 999px;
    background: rgba(24, 38, 24, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: #f0e8d0;
    font-size: 0.63rem;
    line-height: 1;
    font-weight: 700;
    padding: 0.15rem 0.34rem;
    white-space: nowrap;
  }

  .field-label {
    display: block;
    font-size: 0.8rem;
    color: #c8b47a;
    margin-bottom: 0;
  }

  .empty {
    color: #a0b0a0;
    font-size: 0.8rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
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

  .bank-section {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 0.6rem;
  }

  .bank-cards {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

</style>
