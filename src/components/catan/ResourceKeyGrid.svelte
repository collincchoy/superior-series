<script lang="ts">
  import type { Resources } from "../../lib/catan/types.js";
  import { CARD_EMOJI } from "./cardEmoji.js";

  let {
    keys,
    selected,
    onSelect,
    disabled = () => false,
    suffixFor,
    variant = "default",
    labelledby,
  }: {
    keys: readonly (keyof Resources)[];
    selected: keyof Resources | null;
    onSelect: (k: keyof Resources) => void;
    disabled?: (k: keyof Resources) => boolean;
    /** Appended after resource name (e.g. bank ratio "×4"). */
    suffixFor?: (k: keyof Resources) => string;
    variant?: "default" | "emoji";
    labelledby?: string;
  } = $props();
</script>

<div
  class="resource-key-grid"
  class:emoji={variant === "emoji"}
  role="group"
  aria-labelledby={labelledby}
>
  {#each keys as k (k)}
    <button
      type="button"
      class="key-btn"
      class:selected={selected === k}
      disabled={disabled(k)}
      aria-pressed={selected === k}
      aria-label={suffixFor ? `${k} ${suffixFor(k)}` : String(k)}
      onclick={() => onSelect(k)}
    >
      <span class="emoji" aria-hidden="true">{CARD_EMOJI[k]}</span>
      {#if variant === "default"}
        <span class="name">{k}</span>
        {#if suffixFor}
          <span class="suffix">{suffixFor(k)}</span>
        {/if}
      {/if}
    </button>
  {/each}
</div>

<style>
  .resource-key-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .resource-key-grid.emoji {
    gap: 0.3rem;
  }

  .key-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.35rem 0.5rem;
    border-radius: 8px;
    border: 2px solid rgba(255, 255, 255, 0.14);
    background: rgba(26, 42, 26, 0.95);
    color: #f0e8d0;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      border-color 0.12s,
      background 0.12s,
      box-shadow 0.12s;
  }

  .key-btn:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.35);
    background: #223322;
  }

  .key-btn.selected {
    border-color: #6dbf6d;
    box-shadow: 0 0 0 1px rgba(109, 191, 109, 0.45);
  }

  .key-btn:disabled {
    opacity: 0.38;
    cursor: not-allowed;
  }

  .emoji {
    font-size: 1.05rem;
    line-height: 1;
  }

  .resource-key-grid.emoji .key-btn {
    padding: 0.28rem 0.38rem;
    min-width: 2.4rem;
    justify-content: center;
  }

  .name {
    text-transform: capitalize;
  }

  .suffix {
    color: #c8b47a;
    font-size: 0.72rem;
    font-weight: 700;
  }

  @media (prefers-reduced-motion: reduce) {
    .key-btn {
      transition: none;
    }
  }
</style>
