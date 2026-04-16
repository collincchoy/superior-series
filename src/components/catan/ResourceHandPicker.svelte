<script lang="ts">
  import type { Resources } from "../../lib/catan/types.js";
  import { RESOURCE_KEYS } from "./cardEmoji.js";
  import ResourcePill from "./ResourcePill.svelte";

  let {
    selectedLabel = "Selected",
    handLabel = "Hand",
    selected,
    hand,
    onAdjust,
    maxTotal,
  }: {
    selectedLabel?: string;
    handLabel?: string;
    /** Cards already chosen */
    selected: Partial<Resources>;
    /** Available source cards (only non-zero entries shown) */
    hand: Partial<Resources>;
    onAdjust: (k: keyof Resources, dir: 1 | -1) => void;
    /** Optional cap on total selected (e.g. discard limit) */
    maxTotal?: number;
  } = $props();

  let selectedTotal = $derived(
    Object.values(selected).reduce((a, b) => a + (b ?? 0), 0),
  );

  function handCount(k: keyof Resources): number {
    return Math.max(0, (hand[k] ?? 0) - (selected[k] ?? 0));
  }

  let capReached = $derived(
    maxTotal !== undefined && selectedTotal >= maxTotal,
  );
</script>

<div class="transfer-layout">
  <section class="pane">
    <div class="pane-title">{selectedLabel}</div>
    <div class="pill-grid">
      {#each RESOURCE_KEYS as k}
        {#if (selected[k] ?? 0) > 0}
          <button
            type="button"
            class="pill-btn"
            onclick={() => onAdjust(k, -1)}
            aria-label={`Remove ${k}`}
          >
            <ResourcePill resource={k} count={selected[k]!} />
          </button>
        {/if}
      {/each}
      {#if selectedTotal === 0}
        <div class="empty">Nothing selected yet.</div>
      {/if}
    </div>
  </section>

  <section class="pane">
    <div class="pane-title">{handLabel}</div>
    <div class="pill-grid">
      {#each RESOURCE_KEYS as k}
        {#if (hand[k] ?? 0) > 0}
          <ResourcePill
            resource={k}
            count={handCount(k)}
            interactive
            touch
            muted={handCount(k) === 0}
            disabled={handCount(k) === 0 || capReached}
            title={`Add ${k}`}
            onclick={() => onAdjust(k, 1)}
          />
        {/if}
      {/each}
      {#if !Object.values(hand).some((v) => (v ?? 0) > 0)}
        <div class="empty">Nothing available.</div>
      {/if}
    </div>
  </section>
</div>

<style>
  .transfer-layout {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    margin-bottom: 0.75rem;
  }

  .pane {
    border: 1px solid rgba(109, 191, 109, 0.24);
    border-radius: 10px;
    padding: 0.45rem;
    background: rgba(7, 30, 10, 0.5);
  }

  .pane-title {
    font-size: 0.73rem;
    text-transform: uppercase;
    color: #c8b47a;
    margin-bottom: 0.35rem;
    letter-spacing: 0.03em;
  }

  .pill-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    min-height: 2.5rem;
    align-content: flex-start;
  }

  .pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 10px;
    padding: 0.16rem 0.2rem;
    background: rgba(55, 20, 20, 0.3);
    cursor: pointer;
    min-height: 42px;
    transition: filter 120ms ease;
  }

  .pill-btn:hover {
    filter: brightness(1.07);
  }

  .pill-btn:active {
    transform: scale(0.98);
  }

  .empty {
    color: #a0b0a0;
    font-size: 0.82rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .pill-btn {
      transition: none;
    }
    .pill-btn:hover,
    .pill-btn:active {
      filter: none;
      transform: none;
    }
  }
</style>
