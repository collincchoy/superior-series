<script lang="ts">
  import type { Player } from '../../lib/catan/types.js';
  import { CARD_EMOJI, RESOURCE_KEYS } from './cardEmoji.js';

  let { me }: { me: Player } = $props();
</script>

<div class="hand-panel">
  <div class="hand-title">Your hand</div>
  <div class="hand-cards">
    {#each RESOURCE_KEYS as k}
      {#if me.resources[k] > 0}
        <span class="card card-{k}">{CARD_EMOJI[k]}×{me.resources[k]}</span>
      {/if}
    {/each}
  </div>
  {#if me.progressCards.length}
    <div class="progress-cards">
      {#each me.progressCards as c}
        <span class="prog-card{c.isVP ? ' vp-card' : ''}">{c.name}</span>
      {/each}
    </div>
  {/if}
  <div class="improvements">🔬{me.improvements.science} 🤝{me.improvements.trade} ⚔️{me.improvements.politics}</div>
</div>
