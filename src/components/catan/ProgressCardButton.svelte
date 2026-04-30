<script lang="ts">
  import type { ImprovementTrack, ProgressCardName } from "../../lib/catan/types.js";
  import { TRACK_BADGE_COLOR, PROGRESS_CARD_INFO } from "../../lib/catan/constants.js";

  let {
    name,
    track,
    onclick,
    clickable = true,
    previewing = false,
    comfortable = false,
    title: titleProp,
  }: {
    name: ProgressCardName;
    track: ImprovementTrack;
    onclick?: () => void;
    clickable?: boolean;
    previewing?: boolean;
    /** Larger padding for discard modal grid */
    comfortable?: boolean;
    title?: string;
  } = $props();

  let label = $derived(PROGRESS_CARD_INFO[name].title);
  let title = $derived(titleProp ?? PROGRESS_CARD_INFO[name].short);
</script>

<button
  type="button"
  class="prog-card-btn"
  class:clickable
  class:previewing
  class:comfortable
  style="background:{TRACK_BADGE_COLOR[track]}"
  {title}
  onclick={() => onclick?.()}
>
  {label}
</button>

<style>
  .prog-card-btn {
    border: 1px solid rgba(0, 0, 0, 0.35);
    border-radius: 6px;
    padding: 0.15rem 0.4rem;
    font-size: 0.7rem;
    font-weight: 700;
    color: #0f1216;
    text-align: center;
    white-space: normal;
    opacity: 0.75;
    transition:
      transform 120ms ease,
      box-shadow 120ms ease,
      filter 120ms ease;
    cursor: default;
  }

  .prog-card-btn.clickable {
    cursor: pointer;
    opacity: 1;
  }

  .prog-card-btn.clickable:hover {
    transform: translateY(-2px);
    filter: brightness(1.08);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
  }

  .prog-card-btn.clickable:active {
    transform: translateY(0) scale(0.96);
    box-shadow: none;
  }

  .prog-card-btn.comfortable {
    padding: 0.35rem 0.55rem;
    font-size: 0.78rem;
    font-weight: 600;
  }

  .prog-card-btn.previewing {
    outline: 2px solid rgba(255, 255, 255, 0.85);
    outline-offset: 1px;
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .prog-card-btn {
      transition: none;
    }
    .prog-card-btn.clickable:hover {
      transform: none;
      box-shadow: none;
    }
  }
</style>
