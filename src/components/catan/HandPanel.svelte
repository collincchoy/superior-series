<script lang="ts">
  import type {
    ImprovementTrack,
    Player,
    ProgressCardName,
  } from "../../lib/catan/types.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import {
    PROGRESS_AUTO_PLAY_CARDS,
    PROGRESS_CARD_INFO,
  } from "../../lib/catan/constants.js";
  import { CARD_EMOJI, RESOURCE_KEYS } from "./cardEmoji.js";

  let {
    me,
    canPlayProgress = false,
  }: {
    me: Player;
    canPlayProgress: boolean;
  } = $props();

  const RESOURCE_COLORS: Record<keyof Player["resources"], string> = {
    brick: "#c8622a",
    lumber: "#2d7a2d",
    ore: "#7a7a7a",
    grain: "#d4b800",
    wool: "#6dbf6d",
    cloth: "#5fbf9f",
    coin: "#d2a93a",
    paper: "#9bc7e8",
  };

  const TRACK_COLORS: Record<ImprovementTrack, string> = {
    science: "#2e9e4f",
    trade: "#f1c232",
    politics: "#2f6fe4",
  };

  const TRACK_LABEL: Record<ImprovementTrack, string> = {
    science: "🔬",
    trade: "🤝",
    politics: "⚔️",
  };

  function progressCardColor(track: ImprovementTrack): string {
    return TRACK_COLORS[track];
  }

  function canPlayNow(cardName: ProgressCardName, isVP: boolean): boolean {
    return canPlayProgress && !isVP;
  }

  function playCard(cardName: ProgressCardName) {
    store.sendAction({
      type: "PLAY_PROGRESS",
      pid: me.id,
      card: cardName,
    });
  }

  function onCardTap(cardName: ProgressCardName, isVP: boolean, track: ImprovementTrack) {
    const canPlay = canPlayNow(cardName, isVP);
    const canAutoPlay = canPlay && PROGRESS_AUTO_PLAY_CARDS.has(cardName);
    if (canAutoPlay) {
      playCard(cardName);
      return;
    }
    const info = PROGRESS_CARD_INFO[cardName];
    const helperText = isVP
      ? "Victory point cards are kept face-up and are not played manually."
      : !canPlay
        ? "You can play progress cards only during your action phase."
        : info.requiresTarget
          ? "This card needs a target/choice flow. Detailed use flow is being implemented next."
          : "This card can be used when legal. Tap in your action phase.";

    store.openInfoModal({
      kind: "progress",
      card: { name: cardName, track, isVP },
      canPlayNow: canPlay,
      canAutoPlay,
      helperText,
    });
  }
</script>

<div class="hand-panel">
  <div class="hand-title">Your hand</div>
  <div class="hand-cards">
    {#each RESOURCE_KEYS as k}
      {#if me.resources[k] > 0}
        <span class="card card-{k}" style={`background:${RESOURCE_COLORS[k]}`}>
          {CARD_EMOJI[k]}×{me.resources[k]}
        </span>
      {/if}
    {/each}
  </div>
  {#if me.progressCards.length}
    <div class="progress-cards">
      {#each me.progressCards as c}
        <button
          class="prog-card{c.isVP ? ' vp-card' : ''}"
          class:clickable={canPlayNow(c.name, c.isVP)}
          style={!c.isVP ? `background:${progressCardColor(c.track)}` : undefined}
          onclick={() => onCardTap(c.name, c.isVP, c.track)}
          title={PROGRESS_CARD_INFO[c.name].short}
        >{c.name}</button
        >
      {/each}
    </div>
  {/if}
  <div class="improvements">
    <span style={`color:${TRACK_COLORS.science}`}
      >{TRACK_LABEL.science}{me.improvements.science}</span
    >
    <span style={`color:${TRACK_COLORS.trade}`}
      >{TRACK_LABEL.trade}{me.improvements.trade}</span
    >
    <span style={`color:${TRACK_COLORS.politics}`}
      >{TRACK_LABEL.politics}{me.improvements.politics}</span
    >
  </div>
</div>

<style>
  .hand-panel {
    padding: 0.5rem 0.8rem;
    border-bottom: 1px solid #2c5f2e;
    font-size: 0.8rem;
  }

  .hand-title {
    font-size: 0.7rem;
    text-transform: uppercase;
    color: #c8b47a;
    margin-bottom: 0.3rem;
  }

  .hand-cards {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-bottom: 0.3rem;
  }

  .card {
    border-radius: 4px;
    border: 1px solid rgba(0, 0, 0, 0.3);
    padding: 0.15rem 0.4rem;
    font-size: 0.75rem;
    font-weight: 700;
    color: #102010;
  }

  .progress-cards {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-bottom: 0.3rem;
  }

  .prog-card {
    border: 1px solid rgba(0, 0, 0, 0.35);
    border-radius: 4px;
    padding: 0.15rem 0.4rem;
    font-size: 0.7rem;
    font-weight: 700;
    color: #0f1216;
    opacity: 0.75;
  }

  .prog-card.clickable {
    cursor: pointer;
    opacity: 1;
  }

  .prog-card.clickable:hover {
    transform: translateY(-1px);
    filter: brightness(1.06);
  }

  .vp-card {
    background: #d4af37;
    border-color: #f5da73;
    color: #2d2100;
    opacity: 1;
  }

  .improvements {
    display: flex;
    gap: 0.55rem;
    font-size: 0.75rem;
    font-weight: 700;
  }
</style>
