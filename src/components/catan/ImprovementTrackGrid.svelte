<script lang="ts">
  import type { ImprovementTrack } from "../../lib/catan/types.js";

  let {
    selected,
    onSelect,
    labelledby,
  }: {
    selected: ImprovementTrack;
    onSelect: (t: ImprovementTrack) => void;
    labelledby?: string;
  } = $props();

  const OPTIONS = [
    { track: "science" as const, label: "Science" },
    { track: "trade" as const, label: "Trade" },
    { track: "politics" as const, label: "Politics" },
  ];
</script>

<div class="track-grid" role="group" aria-labelledby={labelledby}>
  {#each OPTIONS as { track, label } (track)}
    <button
      type="button"
      class="track-btn"
      class:selected={selected === track}
      aria-pressed={selected === track}
      onclick={() => onSelect(track)}
    >
      {label}
    </button>
  {/each}
</div>

<style>
  .track-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .track-btn {
    padding: 0.38rem 0.65rem;
    border-radius: 8px;
    border: 2px solid rgba(255, 255, 255, 0.14);
    background: rgba(26, 42, 26, 0.95);
    color: #f0e8d0;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    text-transform: capitalize;
    transition:
      border-color 0.12s,
      background 0.12s,
      box-shadow 0.12s;
  }

  .track-btn:hover {
    border-color: rgba(255, 255, 255, 0.35);
    background: #223322;
  }

  .track-btn.selected {
    border-color: #6dbf6d;
    box-shadow: 0 0 0 1px rgba(109, 191, 109, 0.45);
  }

  @media (prefers-reduced-motion: reduce) {
    .track-btn {
      transition: none;
    }
  }
</style>
