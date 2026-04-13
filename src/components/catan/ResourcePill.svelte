<script lang="ts">
  import type { Resources } from "../../lib/catan/types.js";
  import { CARD_EMOJI } from "./cardEmoji.js";

  let {
    resource,
    count,
    interactive = false,
    touch = false,
    disabled = false,
    muted = false,
    title,
    onclick,
  }: {
    resource: keyof Resources;
    count: number;
    interactive?: boolean;
    touch?: boolean;
    disabled?: boolean;
    muted?: boolean;
    title?: string;
    onclick?: () => void;
  } = $props();

  const RESOURCE_COLORS: Record<keyof Resources, string> = {
    brick: "#c8622a",
    lumber: "#2d7a2d",
    ore: "#7a7a7a",
    grain: "#d4b800",
    wool: "#6dbf6d",
    cloth: "#f1c232",
    coin: "#2f6fe4",
    paper: "#2e9e4f",
  };
</script>

{#if interactive}
  <button
    type="button"
    class="resource-pill"
    class:touch
    class:muted
    style={`background:${RESOURCE_COLORS[resource]}`}
    aria-label={`${resource}: ${count}`}
    {title}
    {disabled}
    onclick={onclick}
  >
    {CARD_EMOJI[resource]}×{count}
  </button>
{:else}
  <span class="resource-pill" class:muted style={`background:${RESOURCE_COLORS[resource]}`}>
    {CARD_EMOJI[resource]}×{count}
  </span>
{/if}

<style>
  .resource-pill {
    border-radius: 8px;
    border: 1px solid rgba(0, 0, 0, 0.3);
    padding: 0.2rem 0.48rem;
    font-size: 0.78rem;
    font-weight: 700;
    color: #102010;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    line-height: 1.2;
    transition: transform 120ms ease, box-shadow 120ms ease, filter 120ms ease, opacity 120ms ease;
  }

  button.resource-pill {
    cursor: pointer;
  }

  button.resource-pill.touch {
    min-height: 42px;
    padding: 0.45rem 0.72rem;
    font-size: 0.92rem;
  }

  button.resource-pill:hover:not(:disabled) {
    transform: translateY(-1px);
    filter: brightness(1.07);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
  }

  button.resource-pill:active:not(:disabled) {
    transform: translateY(0) scale(0.98);
    box-shadow: none;
  }

  .resource-pill.muted {
    opacity: 0.55;
  }

  button.resource-pill:disabled {
    opacity: 0.35;
    cursor: default;
    transform: none;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  @media (prefers-reduced-motion: reduce) {
    .resource-pill {
      transition: none;
    }

    button.resource-pill:hover:not(:disabled),
    button.resource-pill:active:not(:disabled) {
      transform: none;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      filter: none;
    }
  }
</style>
