<script lang="ts">
  import {
    PROGRESS_CARD_INFO,
    TRACK_BADGE_COLOR,
  } from "../../lib/catan/constants.js";
  import type { ProgressCard } from "../../lib/catan/types.js";

  let {
    card,
    helperText = "",
  }: {
    card: ProgressCard;
    helperText?: string;
  } = $props();

  let info = $derived(PROGRESS_CARD_INFO[card.name]);
</script>

<div class="track-badge" style={`background:${TRACK_BADGE_COLOR[card.track] ?? "#4d5f4d"}`}>
  {card.track.toUpperCase()}
</div>
<p class="short">{info.short}</p>
<p class="effect">{info.effect}</p>
{#if helperText}
  <p class="helper">{helperText}</p>
{/if}

<style>
  .track-badge {
    display: inline-block;
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
    color: #fff;
    margin-bottom: 0.45rem;
  }

  .short {
    margin: 0;
    font-size: 0.9rem;
    color: #f7efdc;
    line-height: 1.35;
    font-weight: 700;
  }

  .effect {
    margin: 0.45rem 0 0;
    font-size: 0.82rem;
    color: #d6d8cd;
    line-height: 1.35;
  }

  .helper {
    margin: 0.6rem 0 0;
    font-size: 0.76rem;
    color: #c8b47a;
    line-height: 1.35;
  }
</style>
