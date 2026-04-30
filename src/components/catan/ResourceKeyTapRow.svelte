<script lang="ts">
  import type { Resources } from "../../lib/catan/types.js";
  import { CARD_EMOJI } from "./cardEmoji.js";

  /** One tap per resource (no persistent selection) — e.g. Science L3 bonus, trade “ask for”. */
  let {
    keys,
    onTap,
    labelledby,
  }: {
    keys: readonly (keyof Resources)[];
    onTap: (k: keyof Resources) => void;
    labelledby?: string;
  } = $props();
</script>

<div class="tap-strip" role="group" aria-labelledby={labelledby}>
  {#each keys as k (k)}
    <button
      type="button"
      class="tap-btn"
      onclick={() => onTap(k)}
      aria-label={`Select ${k}`}
    >
      <span class="emoji" aria-hidden="true">{CARD_EMOJI[k]}</span>
    </button>
  {/each}
</div>

<style>
  .tap-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .tap-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.28rem 0.38rem;
    min-width: 2.4rem;
    border-radius: 8px;
    border: 2px solid rgba(255, 255, 255, 0.14);
    background: rgba(26, 42, 26, 0.95);
    color: #f0e8d0;
    cursor: pointer;
    transition:
      border-color 0.12s,
      background 0.12s,
      box-shadow 0.12s;
  }

  .tap-btn:hover {
    border-color: rgba(255, 255, 255, 0.35);
    background: #223322;
  }

  .emoji {
    font-size: 1.05rem;
    line-height: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .tap-btn {
      transition: none;
    }
  }
</style>
