<script lang="ts">
  import type {
    ImprovementTrack,
    Player,
    ProgressCardName,
    TurnPhase,
    Resources,
  } from "../../lib/catan/types.js";
  import { TRACK_BADGE_COLOR, PROGRESS_CARD_INFO } from "../../lib/catan/constants.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import { RESOURCE_KEYS, CARD_EMOJI } from "./cardEmoji.js";

  const CARD_GRADIENTS: Record<keyof Resources, [string, string]> = {
    brick:  ["#c8622a", "#8a3010"],
    lumber: ["#2d7a2d", "#154810"],
    ore:    ["#8a8a8a", "#505050"],
    grain:  ["#d4b800", "#8a7200"],
    wool:   ["#6dbf6d", "#3a8a3a"],
    cloth:  ["#2a9aa8", "#0e5a68"],
    coin:   ["#c8a420", "#785c00"],
    paper:  ["#2e9e4f", "#145a20"],
  };

  let {
    me,
    canPlayProgress = false,
    phase,
  }: {
    me: Player;
    canPlayProgress: boolean;
    phase: TurnPhase;
  } = $props();

  let nonVpCards = $derived(me.progressCards.filter(c => !c.isVP));

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
        {@const [c1, c2] = CARD_GRADIENTS[k]}
        <div
          class="res-card"
          style="background:linear-gradient(150deg,{c1},{c2})"
          aria-label="{k}: {me.resources[k]}"
        >
          <div class="res-card-inner"></div>
          <span class="res-icon">{CARD_EMOJI[k]}</span>
          {#if me.resources[k] > 1}
            <span class="res-count">×{me.resources[k]}</span>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
  {#if nonVpCards.length > 0}
    <div class="progress-cards">
      {#each nonVpCards as c}
        <button
          class="prog-card"
          class:clickable={canPlayNow(c.name, c.isVP)}
          style="background:{TRACK_BADGE_COLOR[c.track as ImprovementTrack]}"
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
    flex-wrap: nowrap;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 3px;
    margin-bottom: 0.22rem;
    scrollbar-width: none;
  }
  .hand-cards::-webkit-scrollbar {
    display: none;
  }

  .res-card {
    width: 40px;
    height: 54px;
    border-radius: 7px;
    flex-shrink: 0;
    border: 1.5px solid rgba(255, 255, 255, 0.18);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    position: relative;
    user-select: none;
  }

  .res-card-inner {
    position: absolute;
    inset: 3px;
    border-radius: 5px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    pointer-events: none;
  }

  .res-icon {
    font-size: 16px;
    line-height: 1;
    position: relative;
  }

  .res-count {
    font-size: 10px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.9);
    position: relative;
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

  @media (prefers-reduced-motion: reduce) {
    .prog-card { transition: none; }
    .prog-card.clickable:hover { transform: none; box-shadow: none; }
  }

</style>
