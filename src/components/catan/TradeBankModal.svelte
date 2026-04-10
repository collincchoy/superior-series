<script lang="ts">
  import type { GameState, PlayerId, Resources } from '../../lib/catan/types.js';
  import { store } from '../../lib/catan/store.svelte.js';
  import { CARD_EMOJI, RESOURCE_KEYS } from './cardEmoji.js';

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

  // Reset on open
  $effect(() => {
    if (open) { giveKey = null; getKey = null; }
  });

  let canTrade = $derived(!!giveKey && !!getKey && giveKey !== getKey);

  function confirm() {
    if (!giveKey || !getKey || giveKey === getKey) return;
    store.sendAction({ type: 'TRADE_BANK', pid: localPid, give: { [giveKey]: ratios()[giveKey] }, get: { [getKey]: 1 } });
    open = false;
  }
</script>

{#if open}
  <div class="modal" role="dialog">
    <div class="modal-box">
      <h3>Trade with Bank</h3>
      <div class="trade-section">
        <label>Give (×ratio):</label>
        <div class="trade-options">
          {#each canGive as k}
            <button
              class="trade-card{giveKey === k ? ' selected' : ''}"
              onclick={() => giveKey = k}
            >{CARD_EMOJI[k]} {k}×{ratios()[k]}</button>
          {/each}
          {#if canGive.length === 0}
            <span style="color:#a0b0a0;font-size:0.8rem">Not enough resources</span>
          {/if}
        </div>
      </div>
      <div class="trade-section">
        <label>Receive:</label>
        <div class="trade-options">
          {#each RESOURCE_KEYS as k}
            <button
              class="trade-card{getKey === k ? ' selected' : ''}"
              onclick={() => getKey = k}
            >{CARD_EMOJI[k]} {k}</button>
          {/each}
        </div>
      </div>
      <div class="trade-actions">
        <button class="btn-primary" onclick={confirm} disabled={!canTrade}>Trade</button>
        <button class="btn-secondary" onclick={() => open = false}>Cancel</button>
      </div>
    </div>
  </div>
{/if}
