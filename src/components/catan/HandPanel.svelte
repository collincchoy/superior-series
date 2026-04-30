<script lang="ts">
  import {
    RESOURCE_KEYS,
    type ImprovementTrack,
    type Player,
    type ProgressCardName,
    type TurnPhase,
  } from "../../lib/catan/types.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import ProgressCardButton from "./ProgressCardButton.svelte";
  import ResourceCard from "./ResourceCard.svelte";

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
  let resourceCardCounts = $derived(RESOURCE_KEYS.map(k => me.resources[k]).join("|"));
  let handCardsEl = $state<HTMLDivElement>();
  let showLeftFade = $state(false);
  let showRightFade = $state(false);

  function updateHandAffordance() {
    if (!handCardsEl) {
      showLeftFade = false;
      showRightFade = false;
      return;
    }

    const tolerance = 2;
    const { scrollLeft, clientWidth, scrollWidth } = handCardsEl;
    showLeftFade = scrollLeft > tolerance;
    showRightFade = scrollLeft + clientWidth < scrollWidth - tolerance;
  }

  $effect(() => {
    const el = handCardsEl;
    if (!el || typeof ResizeObserver === "undefined") return;

    const resizeObserver = new ResizeObserver(updateHandAffordance);
    resizeObserver.observe(el);

    return () => resizeObserver.disconnect();
  });

  $effect(() => {
    void resourceCardCounts;
    void handCardsEl;
    updateHandAffordance();
  });

  function canPlayNow(cardName: ProgressCardName, isVP: boolean): boolean {
    if (isVP || !canPlayProgress) return false;
    if (phase === "ROLL_DICE") return cardName === "Alchemy";
    return phase === "ACTION";
  }

  function onCardTap(cardName: ProgressCardName, isVP: boolean, track: ImprovementTrack) {
    const canPlay = canPlayNow(cardName, isVP);
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
      Diplomacy: "Remove an 'open' road (yours or an opponent's). If it was yours, place 1 free road immediately.",
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
  <div class="hand-row">
    <div class={["hand-cards-wrap", showLeftFade && "fade-left", showRightFade && "fade-right"]}>
      <div class="hand-cards" bind:this={handCardsEl} onscroll={updateHandAffordance}>
        {#each RESOURCE_KEYS as k (k)}
          {#if me.resources[k] > 0}
            <ResourceCard cardKey={k} count={me.resources[k]} />
          {/if}
        {/each}
      </div>
    </div>
    {#if nonVpCards.length > 0}
      <div class="progress-cards">
        {#each nonVpCards as c (c)}
          <ProgressCardButton
            name={c.name}
            track={c.track}
            clickable={canPlayNow(c.name, c.isVP)}
            onclick={() => onCardTap(c.name, c.isVP, c.track)}
          />
        {/each}
      </div>
    {/if}
  </div>
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

  .hand-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .hand-cards-wrap {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  .hand-cards-wrap::before,
  .hand-cards-wrap::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 3px;
    z-index: 1;
    width: 18px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 120ms ease;
  }

  .hand-cards-wrap::before {
    left: 0;
    background: linear-gradient(to right, rgba(15, 18, 22, 0.72), rgba(15, 18, 22, 0));
  }

  .hand-cards-wrap::after {
    right: 0;
    background: linear-gradient(to left, rgba(15, 18, 22, 0.72), rgba(15, 18, 22, 0));
  }

  .hand-cards-wrap.fade-left::before,
  .hand-cards-wrap.fade-right::after {
    opacity: 1;
  }

  .hand-cards {
    display: flex;
    flex-wrap: nowrap;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 3px;
    width: 100%;
    box-sizing: border-box;
    scrollbar-width: none;
  }
  .hand-cards::-webkit-scrollbar {
    display: none;
  }

  .progress-cards {
    display: grid;
    grid-template-columns: repeat(2, min-content);
    gap: 0.24rem;
    flex-shrink: 0;
    margin-inline-start: auto;
  }

  @media (max-width: var(--catan-compact-max)) {
    .hand-panel {
      padding: 0.26rem 0.5rem;
    }

    .hand-title {
      margin-bottom: 0.12rem;
    }
  }

</style>
