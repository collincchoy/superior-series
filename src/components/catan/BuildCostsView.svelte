<script lang="ts">
  import { BUILD_COST_HINTS } from "../../lib/catan/constants.js";
  import { CARD_EMOJI } from "./cardEmoji.js";
</script>

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

<style>
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
</style>
