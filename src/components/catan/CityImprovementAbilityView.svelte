<script lang="ts">
  import type { ImprovementTrack } from "../../lib/catan/types.js";

  let { track }: { track: ImprovementTrack } = $props();

  const TRACK_ICON: Record<ImprovementTrack, string> = {
    science: "🔬",
    trade: "🤝",
    politics: "⚔️",
  };

  const TRACK_COLOR: Record<ImprovementTrack, string> = {
    science: "#2e9e4f",
    trade: "#f1c232",
    politics: "#2f6fe4",
  };

  const TRACK_ABILITY: Record<ImprovementTrack, string> = {
    science:
      "During each production phase, if you receive no production (excluding a 7), take 1 resource of your choice from the bank.",
    trade:
      "You may trade any 2 identical commodities for any 1 resource or commodity directly with the bank.",
    politics:
      "You may promote strong knights (strength 2) to mighty knights (strength 3).",
  };
</script>

<div class="ability-view">
  <div class="level-badge" style="border-color: {TRACK_COLOR[track]}">
    <span class="icon">{TRACK_ICON[track]}</span>
    <span class="label" style="color: {TRACK_COLOR[track]}">Level 3 Ability</span>
  </div>
  <p class="description">{TRACK_ABILITY[track]}</p>
</div>

<style>
  .ability-view {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.25rem 0;
  }

  .level-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    border: 1px solid;
    border-radius: 6px;
    padding: 0.3rem 0.6rem;
    width: fit-content;
  }

  .icon {
    font-size: 1rem;
    line-height: 1;
  }

  .label {
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .description {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.5;
    color: #d6d8cd;
  }
</style>
