<script lang="ts">
  import type {
    ImprovementTrack,
    Player,
    ProgressCardName,
    TurnPhase,
  } from "../../lib/catan/types.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import {
    PROGRESS_CARD_INFO,
  } from "../../lib/catan/constants.js";
  import { RESOURCE_KEYS } from "./cardEmoji.js";
  import ResourcePill from "./ResourcePill.svelte";

  let {
    me,
    canPlayProgress = false,
    phase,
  }: {
    me: Player;
    canPlayProgress: boolean;
    phase: TurnPhase;
  } = $props();

  const TRACK_COLORS: Record<ImprovementTrack, string> = {
    science: "#2e9e4f",
    trade: "#f1c232",
    politics: "#2f6fe4",
  };

  function progressCardColor(track: ImprovementTrack): string {
    return TRACK_COLORS[track];
  }

  function canPlayNow(cardName: ProgressCardName, isVP: boolean): boolean {
    if (isVP || !canPlayProgress) return false;
    if (phase === "ROLL_DICE") return cardName === "Alchemy";
    return phase === "ACTION";
  }

  function onCardTap(cardName: ProgressCardName, isVP: boolean, track: ImprovementTrack) {
    const canPlay = canPlayNow(cardName, isVP);
    const info = PROGRESS_CARD_INFO[cardName];
    const CARD_HELPER: Partial<Record<ProgressCardName, string>> = {
      RoadBuilding: "Click 'Use Card' then place up to 2 roads free on the board.",
      Smithing: "Click 'Use Card' then click up to 2 of your knights to promote them free.",
      Medicine: "Select one of your settlements to upgrade to a city for 1 grain + 2 ore.",
      Engineering: "Select one of your unwalled cities to place a city wall for free.",
      Merchant: "Select a land hex adjacent to your buildings to control the merchant (2:1 trade + 1 VP).",
      Invention: "Select two number tokens to swap (not 2, 6, 8, or 12).",
      Taxation: "Move the robber and steal 1 card from every player with a building there. Requires robber to be active.",
      CommercialHarbor: "Offer each opponent 1 resource; they must give you 1 commodity in return.",
      Espionage: "Look at an opponent's hand and steal one of their non-VP progress cards.",
      GuildDues: "Take 2 resource/commodity cards from a player who has at least as many VP as you.",
      Intrigue: "Displace an enemy knight connected to your road network — without using one of your own.",
      Treason: "Remove any enemy knight from the board.",
      Diplomacy: "Remove an 'open' road. If it was your own, place 1 free road immediately.",
    };
    const helperText = isVP
      ? "Victory point cards are kept face-up and are not played manually."
      : !canPlay
        ? "Only Alchemy can be played in roll phase; other progress cards are action-phase only."
        : (canPlay && CARD_HELPER[cardName]) ?? "Tap 'Use Card' to play this card.";

    store.openInfoModal({
      kind: "progress",
      card: { name: cardName, track, isVP },
      canPlayNow: canPlay,
      helperText,
    });
  }
</script>

<div class="hand-panel">
  <div class="hand-title">Your hand</div>
  <div class="hand-cards">
    {#each RESOURCE_KEYS as k}
      {#if me.resources[k] > 0}
        <ResourcePill resource={k} count={me.resources[k]} />
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
</div>

<style>
  .hand-panel {
    padding: 0.38rem 0.65rem;
    border-bottom: 1px solid #2c5f2e;
    font-size: 0.8rem;
  }

  .hand-title {
    font-size: 0.7rem;
    text-transform: uppercase;
    color: #c8b47a;
    margin-bottom: 0.2rem;
  }

  .hand-cards {
    display: flex;
    flex-wrap: wrap;
    gap: 0.24rem;
    margin-bottom: 0.22rem;
  }

  .progress-cards {
    display: flex;
    flex-wrap: wrap;
    gap: 0.24rem;
    margin-bottom: 0.2rem;
  }

  .prog-card {
    border: 1px solid rgba(0, 0, 0, 0.35);
    border-radius: 6px;
    padding: 0.15rem 0.4rem;
    font-size: 0.7rem;
    font-weight: 700;
    color: #0f1216;
    opacity: 0.75;
    transition: transform 120ms ease, box-shadow 120ms ease, filter 120ms ease;
  }

  .prog-card.clickable {
    cursor: pointer;
    opacity: 1;
  }

  .prog-card.clickable:hover {
    transform: translateY(-2px);
    filter: brightness(1.08);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
  }

  .prog-card.clickable:active {
    transform: translateY(0) scale(0.96);
    box-shadow: none;
  }

  .vp-card {
    background: #d4af37;
    border-color: #f5da73;
    color: #2d2100;
    opacity: 1;
    box-shadow: 0 0 6px rgba(212, 175, 55, 0.3);
  }

  @media (prefers-reduced-motion: reduce) {
    .prog-card { transition: none; }
    .prog-card.clickable:hover { transform: none; box-shadow: none; }
  }

</style>
