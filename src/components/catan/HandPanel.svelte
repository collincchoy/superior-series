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

<style>
  .hand-panel {
    padding: 0.5rem 0.8rem;
    border-bottom: 1px solid #2c5f2e;
    font-size: 0.8rem;
  }

  .hand-title {
    font-size: 0.7rem;
    text-transform: uppercase;
    color: #c8b47a;
    margin-bottom: 0.3rem;
  }

  .hand-cards {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-bottom: 0.3rem;
  }

  .card {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    padding: 0.15rem 0.4rem;
    font-size: 0.75rem;
  }

  .progress-cards {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-bottom: 0.3rem;
  }

  .prog-card {
    background: rgba(100, 60, 160, 0.4);
    border: 1px solid rgba(180, 120, 255, 0.3);
    border-radius: 4px;
    padding: 0.15rem 0.4rem;
    font-size: 0.7rem;
  }

  .vp-card {
    background: rgba(180, 140, 0, 0.4);
    border-color: #f5c842;
  }

  .improvements {
    color: #a0b0a0;
    font-size: 0.75rem;
  }
</style>
