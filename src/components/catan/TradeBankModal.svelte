<script lang="ts">
  import type { GameState, PlayerId, Resources } from '../../lib/catan/types.js';
  import { store } from '../../lib/catan/store.svelte.js';
  import { CARD_EMOJI, RESOURCE_KEYS } from './cardEmoji.js';
  import Modal from './Modal.svelte';

  let { gameState, localPid, open = $bindable() }: {
    gameState: GameState;
    localPid: PlayerId;
    open: boolean;
  } = $props();

  let me = $derived(gameState.players[localPid]!);

  let ratios = $derived(() => {
    const r: Record<keyof Resources, number> = {
      brick:4, lumber:4, ore:4, grain:4, wool:4, cloth:4, coin:4, paper:4,
    };
    for (const harbor of gameState.board.harbors) {
      const hasHarbor = harbor.vertices.some(vid => gameState.board.vertices[vid]?.playerId === localPid);
      if (!hasHarbor) continue;
      if (harbor.type === 'generic') {
        for (const k of RESOURCE_KEYS) r[k] = Math.min(r[k], 3);
      } else if (harbor.type in r) {
        r[harbor.type as keyof Resources] = 2;
      }
    }
    return r;
  });

  let canGive = $derived(RESOURCE_KEYS.filter(k => me.resources[k] >= ratios()[k]));
  let giveKey = $state<keyof Resources | null>(null);
  let getKey  = $state<keyof Resources | null>(null);
  let canTrade = $derived(!!giveKey && !!getKey && giveKey !== getKey);

  $effect(() => { if (open) { giveKey = null; getKey = null; } });

  function confirm() {
    if (!giveKey || !getKey || giveKey === getKey) return;
    store.sendAction({ type: 'TRADE_BANK', pid: localPid, give: { [giveKey]: ratios()[giveKey] }, get: { [getKey]: 1 } });
    open = false;
  }
</script>

<Modal bind:open title="Trade with Bank" closeOnBackdrop>
  <div class="section">
    <label>Give (×ratio):</label>
    <div class="options">
      {#each canGive as k}
        <button class="card-btn" class:selected={giveKey === k} onclick={() => giveKey = k}>
          {CARD_EMOJI[k]} {k}×{ratios()[k]}
        </button>
      {/each}
      {#if canGive.length === 0}
        <span class="empty">Not enough resources</span>
      {/if}
    </div>
  </div>
  <div class="section">
    <label>Receive:</label>
    <div class="options">
      {#each RESOURCE_KEYS as k}
        <button class="card-btn" class:selected={getKey === k} onclick={() => getKey = k}>
          {CARD_EMOJI[k]} {k}
        </button>
      {/each}
    </div>
  </div>
  <div class="actions">
    <button class="btn-primary" onclick={confirm} disabled={!canTrade}>Trade</button>
    <button class="btn-secondary" onclick={() => open = false}>Cancel</button>
  </div>
</Modal>

<style>
  .section { margin-bottom: 0.8rem; }

  label {
    display: block;
    font-size: 0.8rem;
    color: #c8b47a;
    margin-bottom: 0.3rem;
  }

  .options { display: flex; flex-wrap: wrap; gap: 0.3rem; }

  .card-btn {
    background: rgba(255,255,255,0.08);
    color: #f0e8d0;
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 5px;
    padding: 0.35rem 0.6rem;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .card-btn.selected { background: #3a5e1e; border-color: #6dbf6d; }

  .empty { color: #a0b0a0; font-size: 0.8rem; }

  .actions { display: flex; gap: 0.5rem; margin-top: 0.8rem; }

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
  .btn-primary:disabled { opacity: 0.4; cursor: default; }

  .btn-secondary {
    background: rgba(255,255,255,0.1);
    color: #f0e8d0;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 6px;
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
    cursor: pointer;
  }
</style>
