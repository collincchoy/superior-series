<script lang="ts">
  import type { Resources } from "../../lib/catan/types.js";
  import { CARD_GRADIENTS, CARD_EMOJI } from "./cardEmoji.js";

  let {
    cardKey,
    count,
    selected = false,
    disabled = false,
    onclick,
  }: {
    cardKey: keyof Resources;
    count?: number;
    selected?: boolean;
    disabled?: boolean;
    onclick?: () => void;
  } = $props();

  const [c1, c2] = CARD_GRADIENTS[cardKey];
  const gradient = `linear-gradient(150deg,${c1},${c2})`;
</script>

{#if onclick}
  <button
    type="button"
    class="res-card"
    class:selected
    style="background:{gradient}"
    {disabled}
    aria-label="{cardKey}{selected ? ' (selected)' : ''}"
    {onclick}
  >
    <div class="res-card-inner"></div>
    <span class="res-icon">{CARD_EMOJI[cardKey]}</span>
    {#if count && count > 1}
      <span class="res-count">×{count}</span>
    {/if}
  </button>
{:else}
  <div
    class="res-card"
    style="background:{gradient}"
    aria-label="{cardKey}{count && count > 1 ? `: ${count}` : ''}"
  >
    <div class="res-card-inner"></div>
    <span class="res-icon">{CARD_EMOJI[cardKey]}</span>
    {#if count && count > 1}
      <span class="res-count">×{count}</span>
    {/if}
  </div>
{/if}

<style>
  .res-card {
    width: 40px;
    height: 54px;
    border-radius: 7px;
    flex-shrink: 0;
    border: 1.5px solid rgba(255, 255, 255, 0.18);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    position: relative;
    user-select: none;
    padding: 0;
  }

  button.res-card {
    cursor: pointer;
    transition: border-color 0.12s, box-shadow 0.12s, filter 0.12s;
  }

  button.res-card:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.5);
    filter: brightness(1.15);
  }

  button.res-card.selected {
    border-color: #f5c842;
    box-shadow: 0 0 0 2px #f5c842, 0 3px 10px rgba(0, 0, 0, 0.5);
    filter: brightness(1.1);
  }

  button.res-card:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .res-card-inner {
    position: absolute;
    inset: 3px;
    border-radius: 5px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    pointer-events: none;
  }

  .res-icon {
    font-size: 16px;
    line-height: 1;
    position: relative;
  }

  .res-count {
    font-size: 10px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.9);
    position: relative;
  }
</style>
