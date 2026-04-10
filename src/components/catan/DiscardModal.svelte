<script lang="ts">
  import type { GameState, PlayerId, Resources } from '../../lib/catan/types.js';
  import { store } from '../../lib/catan/store.svelte.js';
  import { CARD_EMOJI, RESOURCE_KEYS } from './cardEmoji.js';

  let { gameState, localPid }: { gameState: GameState; localPid: PlayerId } = $props();

  let needed = $derived(gameState.pendingDiscard?.remaining[localPid] ?? 0);
  let show = $derived(gameState.phase === 'DISCARD' && needed > 0);
  let me = $derived(gameState.players[localPid]!);

  let selected = $state<Partial<Resources>>({});

  // Reset selection whenever the modal opens
  $effect(() => {
    if (show) selected = {};
  });

  let selectedTotal = $derived(
    Object.values(selected).reduce((a, b) => a + (b ?? 0), 0)
  );

  function adjust(k: keyof Resources, dir: number) {
    const cur = selected[k] ?? 0;
    if (dir > 0 && selectedTotal >= needed) return;
    selected[k] = Math.max(0, Math.min(me.resources[k], cur + dir));
  }

  function confirm() {
    if (selectedTotal !== needed) return;
    store.sendAction({ type: 'DISCARD', pid: localPid, cards: selected });
  }
</script>

{#if show}
  <div class="modal">
    <div class="modal-box">
      <h3>Discard {needed} cards</h3>
      <div class="discard-grid">
        {#each RESOURCE_KEYS as k}
          {#if me.resources[k] > 0}
            <div class="discard-item">
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
      <div>Selected: {selectedTotal} / {needed}</div>
      <button class="btn-primary" onclick={confirm} disabled={selectedTotal !== needed}>Discard</button>
    </div>
  </div>
{/if}
