<script lang="ts">
  import { store } from "../../lib/catan/store.svelte.js";
  import { CARD_EMOJI } from "./cardEmoji.js";
  import { PROGRESS_CARD_INFO } from "../../lib/catan/constants.js";
  import type {
    CommodityType,
    EdgeId,
    HexId,
    PlayerId,
    ProgressCard,
    ResourceType,
    Resources,
    VertexId,
  } from "../../lib/catan/types.js";
  import { computeVP } from "../../lib/catan/game.js";
  import {
    computeValidTargets,
    type PendingAction,
  } from "../../lib/catan/validTargets.js";

  let {
    card,
    canPlayNow,
    helperText,
    onClose,
  }: {
    card: ProgressCard;
    canPlayNow: boolean;
    helperText: string;
    onClose: () => void;
  } = $props();

  const RESOURCE_OPTIONS: ResourceType[] = [
    "brick",
    "lumber",
    "ore",
    "grain",
    "wool",
  ];
  const COMMODITY_OPTIONS: CommodityType[] = ["cloth", "coin", "paper"];
  const CARD_TYPE_OPTIONS: Array<keyof typeof CARD_EMOJI> = [
    "brick",
    "lumber",
    "ore",
    "grain",
    "wool",
    "cloth",
    "coin",
    "paper",
  ];
  const CRANE_TRACK_OPTIONS = ["science", "trade", "politics"] as const;

  let selectedResource = $state<ResourceType>("grain");
  let selectedCommodity = $state<CommodityType>("cloth");
  let selectedCardType = $state<keyof typeof CARD_EMOJI>("cloth");
  let selectedCraneTrack = $state<(typeof CRANE_TRACK_OPTIONS)[number]>(
    "science",
  );
  let die1 = $state(1);
  let die2 = $state(1);

  let selectedTargetPid = $state<PlayerId | null>(null);
  let selectedEspCardIndex = $state<number>(0);
  let gdResource1 = $state<keyof Resources>("grain");
  let gdResource2 = $state<keyof Resources>("grain");
  let selectedComHarborResource = $state<ResourceType>("grain");
  let alchemyLateMessage = $state(false);

  let gs = $derived(store.gameState);
  let myPid = $derived(store.localPid);

  const targetCount = (pending: PendingAction): number => {
    if (!gs || !myPid) return 0;
    const targets = computeValidTargets(gs, myPid, pending);
    return (
      targets.validVertices.size +
      targets.validEdges.size +
      targets.validHexes.size
    );
  };



  let opponents = $derived(
    gs && myPid ? (gs.playerOrder.filter((p) => p !== myPid) as PlayerId[]) : ([] as PlayerId[]),
  );

  let opponentsGdEligible = $derived(
    gs && myPid
      ? opponents.filter((p) => computeVP(gs, p) >= computeVP(gs, myPid))
      : ([] as PlayerId[]),
  );

  let canUseState = $derived.by(() => {
    if (!canPlayNow) {
      return {
        enabled: false,
        reason:
          card.name === "Alchemy"
            ? "Alchemy can only be used before rolling."
            : "This card can only be used during your action phase.",
      };
    }

    if (!gs || !myPid) {
      return { enabled: false, reason: "Waiting for game state." };
    }

    const me = gs.players[myPid]!;

    switch (card.name) {
      case "Medicine": {
        if ((me.resources.grain ?? 0) < 1 || (me.resources.ore ?? 0) < 2) {
          return { enabled: false, reason: "Need 1 grain and 2 ore." };
        }
        if (me.supply.cities <= 0) {
          return { enabled: false, reason: "No cities left in your supply." };
        }
        return targetCount({ type: "progress_select_vertex", card: "Medicine" }) >
          0
          ? { enabled: true, reason: "" }
          : { enabled: false, reason: "No valid settlement to upgrade." };
      }
      case "Engineering": {
        if (me.supply.cityWalls <= 0) {
          return {
            enabled: false,
            reason: "No city walls left in your supply.",
          };
        }
        return targetCount({ type: "progress_select_vertex", card: "Engineering" }) >
          0
          ? { enabled: true, reason: "" }
          : { enabled: false, reason: "No valid city for a wall." };
      }
      case "Merchant":
        return targetCount({ type: "progress_select_hex", card: "Merchant" }) > 0
          ? { enabled: true, reason: "" }
          : {
              enabled: false,
              reason: "No adjacent land hex available for Merchant.",
            };
      case "Invention":
        return targetCount({
          type: "progress_select_hex_pair",
          card: "Invention",
          picked: [],
        }) >= 2
          ? { enabled: true, reason: "" }
          : {
              enabled: false,
              reason: "No legal pair of number hexes to swap.",
            };
      case "Taxation":
        return gs.barbarian.robberActive
          ? { enabled: true, reason: "" }
          : {
              enabled: false,
              reason:
                "Taxation requires the robber to be active after the first barbarian attack.",
            };
      case "Diplomacy":
        return targetCount({ type: "progress_select_edge", card: "Diplomacy" }) > 0
          ? { enabled: true, reason: "" }
          : { enabled: false, reason: "No open road to target." };
      case "Intrigue":
        return targetCount({ type: "progress_select_knight", card: "Intrigue" }) > 0
          ? { enabled: true, reason: "" }
          : { enabled: false, reason: "No valid enemy knight on your network." };
      case "Treason":
        return targetCount({ type: "progress_select_knight", card: "Treason" }) > 0
          ? { enabled: true, reason: "" }
          : { enabled: false, reason: "No enemy knight to remove." };
      case "CommercialHarbor":
        return (me.resources[selectedComHarborResource] ?? 0) > 0
          ? { enabled: true, reason: "" }
          : { enabled: false, reason: "You must offer a resource you have." };
      case "Espionage": {
        const hasStealable = opponents.some(
          (p) => (gs.players[p]?.progressCards ?? []).filter((c) => !c.isVP).length > 0,
        );
        return hasStealable
          ? { enabled: true, reason: "" }
          : { enabled: false, reason: "No opponent has a stealable progress card." };
      }
      case "GuildDues": {
        const hasEligible = opponentsGdEligible.some((p) => {
          const resources = gs.players[p]?.resources;
          if (!resources) return false;
          return Object.values(resources).some((v) => (v ?? 0) > 0);
        });
        return hasEligible
          ? { enabled: true, reason: "" }
          : { enabled: false, reason: "No eligible opponent with cards to take." };
      }
      default:
        return { enabled: true, reason: "" };
    }
  });



  let espTargetCards = $derived(
    gs && selectedTargetPid
      ? (gs.players[selectedTargetPid]?.progressCards ?? []).filter((c) => !c.isVP)
      : [],
  );

  let gdTargetResources = $derived(
    gs && selectedTargetPid
      ? (
          Object.entries(gs.players[selectedTargetPid]?.resources ?? {}) as [
            keyof Resources,
            number,
          ][]
        )
          .filter(([, v]) => v > 0)
          .map(([k]) => k)
      : ([] as (keyof Resources)[]),
  );

  $effect(() => {
    if (card.name !== "Alchemy") {
      alchemyLateMessage = false;
      return;
    }
    if (canPlayNow) alchemyLateMessage = false;
  });

  function close() {
    onClose();
  }

  function playProgress() {
    const pid = store.localPid;
    if (!pid) return;

    if (!canUseState.enabled) return;

    if (!canPlayNow) {
      if (card.name === "Alchemy") alchemyLateMessage = true;
      return;
    }

    if (card.name === "ResourceMonopoly") {
      store.sendAction({
        type: "PLAY_PROGRESS",
        pid,
        card: card.name,
        params: { resource: selectedResource },
      });
      close();
      return;
    }

    if (card.name === "TradeMonopoly") {
      store.sendAction({
        type: "PLAY_PROGRESS",
        pid,
        card: card.name,
        params: { commodity: selectedCommodity },
      });
      close();
      return;
    }

    if (card.name === "Alchemy") {
      store.sendAction({
        type: "PLAY_PROGRESS",
        pid,
        card: card.name,
        params: { die1, die2 },
      });
      close();
      return;
    }

    if (card.name === "MerchantFleet") {
      store.sendAction({
        type: "PLAY_PROGRESS",
        pid,
        card: card.name,
        params: { cardType: selectedCardType },
      });
      close();
      return;
    }

    if (card.name === "Crane") {
      store.sendAction({
        type: "PLAY_PROGRESS",
        pid,
        card: card.name,
        params: { track: selectedCraneTrack },
      });
      close();
      return;
    }

    if (card.name === "CommercialHarbor") {
      store.sendAction({ type: "PLAY_PROGRESS", pid, card: "CommercialHarbor", params: { resource: selectedComHarborResource } });
      close();
      return;
    }

    if (card.name === "Espionage") {
      if (!selectedTargetPid) return;
      store.sendAction({ type: "PLAY_PROGRESS", pid, card: "Espionage", params: { targetPid: selectedTargetPid, cardIndex: selectedEspCardIndex } });
      close();
      return;
    }

    if (card.name === "GuildDues") {
      if (!selectedTargetPid) return;
      const takeCards: Partial<Resources> = {};
      if (gdResource1) takeCards[gdResource1] = (takeCards[gdResource1] ?? 0) + 1;
      if (gdResource2) takeCards[gdResource2] = (takeCards[gdResource2] ?? 0) + 1;
      store.sendAction({ type: "PLAY_PROGRESS", pid, card: "GuildDues", params: { targetPid: selectedTargetPid, takeCards } });
      close();
      return;
    }

    if (!PROGRESS_CARD_INFO[card.name].requiresTarget) {
      store.sendAction({ type: "PLAY_PROGRESS", pid, card: card.name });
      close();
      return;
    }

    if (card.name === "RoadBuilding" || card.name === "Smithing") {
      store.sendAction({ type: "PLAY_PROGRESS", pid, card: card.name });
      close();
    }
  }
</script>

<p class="helper">{canUseState.enabled ? helperText : canUseState.reason}</p>

{#if canPlayNow && card.name === "ResourceMonopoly"}
  <div class="picker-row">
    <label for="res-select">Resource</label>
    <select id="res-select" bind:value={selectedResource}>
      {#each RESOURCE_OPTIONS as option}
        <option value={option}>{CARD_EMOJI[option]} {option}</option>
      {/each}
    </select>
  </div>
{:else if canPlayNow && card.name === "TradeMonopoly"}
  <div class="picker-row">
    <label for="com-select">Commodity</label>
    <select id="com-select" bind:value={selectedCommodity}>
      {#each COMMODITY_OPTIONS as option}
        <option value={option}>{CARD_EMOJI[option]} {option}</option>
      {/each}
    </select>
  </div>
{:else if canPlayNow && card.name === "Alchemy"}
  <div class="picker-grid">
    <div class="picker-row">
      <label for="die-one">Die 1</label>
      <select id="die-one" bind:value={die1}>
        {#each [1, 2, 3, 4, 5, 6] as value}
          <option value={value}>{value}</option>
        {/each}
      </select>
    </div>
    <div class="picker-row">
      <label for="die-two">Die 2</label>
      <select id="die-two" bind:value={die2}>
        {#each [1, 2, 3, 4, 5, 6] as value}
          <option value={value}>{value}</option>
        {/each}
      </select>
    </div>
  </div>
{:else if canPlayNow && card.name === "MerchantFleet"}
  <div class="picker-row">
    <label for="fleet-select">2:1 card type</label>
    <select id="fleet-select" bind:value={selectedCardType}>
      {#each CARD_TYPE_OPTIONS as option}
        <option value={option}>{CARD_EMOJI[option]} {option}</option>
      {/each}
    </select>
  </div>
{:else if canPlayNow && card.name === "Crane"}
  <div class="picker-row">
    <label for="crane-select">Discount track</label>
    <select id="crane-select" bind:value={selectedCraneTrack}>
      {#each CRANE_TRACK_OPTIONS as option}
        <option value={option}>{option}</option>
      {/each}
    </select>
  </div>
{:else if canPlayNow && card.name === "Medicine"}
  <p class="helper">Click a settlement on the board to upgrade it.</p>
  <button class="board-select-btn" disabled={!canUseState.enabled} onclick={() => {
    if (!canUseState.enabled) return;
    store.setPendingAction({ type: "progress_select_vertex", card: "Medicine" });
    onClose();
  }}>Select on board</button>
{:else if canPlayNow && card.name === "Engineering"}
  <p class="helper">Click a city on the board to add a wall.</p>
  <button class="board-select-btn" disabled={!canUseState.enabled} onclick={() => {
    if (!canUseState.enabled) return;
    store.setPendingAction({ type: "progress_select_vertex", card: "Engineering" });
    onClose();
  }}>Select on board</button>
{:else if canPlayNow && card.name === "Merchant"}
  <p class="helper">Click a land hex adjacent to your buildings to place the merchant.</p>
  <button class="board-select-btn" disabled={!canUseState.enabled} onclick={() => {
    if (!canUseState.enabled) return;
    store.setPendingAction({ type: "progress_select_hex", card: "Merchant" });
    onClose();
  }}>Select on board</button>
{:else if canPlayNow && card.name === "Invention"}
  <p class="helper">Click two number hexes (not 2, 6, 8, or 12) to swap their values.</p>
  <button class="board-select-btn" disabled={!canUseState.enabled} onclick={() => {
    if (!canUseState.enabled) return;
    store.setPendingAction({ type: "progress_select_hex_pair", card: "Invention", picked: [] });
    onClose();
  }}>Select on board</button>
{:else if canPlayNow && card.name === "Taxation"}
  {#if !gs?.barbarian.robberActive}
    <p class="helper" style="color:#f87171">Taxation requires the robber to be active (after first barbarian attack).</p>
  {:else}
    <p class="helper">Click a hex to move the robber there.</p>
    <button class="board-select-btn" disabled={!canUseState.enabled} onclick={() => {
      if (!canUseState.enabled) return;
      store.setPendingAction({ type: "progress_select_hex", card: "Taxation" });
      onClose();
    }}>Select on board</button>
  {/if}
{:else if canPlayNow && card.name === "CommercialHarbor"}
  <div class="picker-row">
    <label for="ch-res">Offer resource</label>
    <select id="ch-res" bind:value={selectedComHarborResource}>
      {#each RESOURCE_OPTIONS as option}
        <option value={option}>{CARD_EMOJI[option]} {option}</option>
      {/each}
    </select>
  </div>
{:else if canPlayNow && card.name === "Espionage"}
  <div class="picker-row">
    <label for="esp-target">Target player</label>
    <select id="esp-target" bind:value={selectedTargetPid}>
      {#each opponents as p}
        <option value={p}>{gs?.players[p]?.name ?? p}</option>
      {/each}
    </select>
  </div>
  {#if selectedTargetPid && espTargetCards.length > 0}
    <div class="picker-row">
      <label for="esp-card">Card to steal</label>
      <select id="esp-card" bind:value={selectedEspCardIndex}>
        {#each espTargetCards as targetCard, i}
          <option value={i}>{targetCard.name}</option>
        {/each}
      </select>
    </div>
  {:else if selectedTargetPid}
    <p class="helper" style="color:#94a3b8">That player has no stealable cards.</p>
  {/if}
{:else if canPlayNow && card.name === "GuildDues"}
  <div class="picker-row">
    <label for="gd-target">Target player (>= your VP)</label>
    <select id="gd-target" bind:value={selectedTargetPid}>
      {#each opponentsGdEligible as p}
        <option value={p}>{gs?.players[p]?.name ?? p}</option>
      {/each}
    </select>
  </div>
  {#if selectedTargetPid}
    <div class="picker-grid">
      <div class="picker-row">
        <label for="gd-card1">Card 1</label>
        <select id="gd-card1" bind:value={gdResource1}>
          {#each gdTargetResources as key}
            <option value={key}>{CARD_EMOJI[key as keyof typeof CARD_EMOJI] ?? ""} {key}</option>
          {/each}
        </select>
      </div>
      <div class="picker-row">
        <label for="gd-card2">Card 2</label>
        <select id="gd-card2" bind:value={gdResource2}>
          {#each gdTargetResources as key}
            <option value={key}>{CARD_EMOJI[key as keyof typeof CARD_EMOJI] ?? ""} {key}</option>
          {/each}
        </select>
      </div>
    </div>
  {/if}
{:else if canPlayNow && card.name === "Intrigue"}
  <p class="helper">Click an enemy knight on your network to displace it.</p>
  <button class="board-select-btn" disabled={!canUseState.enabled} onclick={() => {
    if (!canUseState.enabled) return;
    store.setPendingAction({ type: "progress_select_knight", card: "Intrigue" });
    onClose();
  }}>Select on board</button>
{:else if canPlayNow && card.name === "Treason"}
  <p class="helper">Click an enemy knight to remove it.</p>
  <button class="board-select-btn" disabled={!canUseState.enabled} onclick={() => {
    if (!canUseState.enabled) return;
    store.setPendingAction({ type: "progress_select_knight", card: "Treason" });
    onClose();
  }}>Select on board</button>
{:else if canPlayNow && card.name === "Diplomacy"}
  <p class="helper">Click an open enemy road to remove it.</p>
  <button class="board-select-btn" disabled={!canUseState.enabled} onclick={() => {
    if (!canUseState.enabled) return;
    store.setPendingAction({ type: "progress_select_edge", card: "Diplomacy" });
    onClose();
  }}>Select on board</button>
{/if}

<div class="actions">
  {#if card.name === "Alchemy" ||
    (canPlayNow &&
      (!PROGRESS_CARD_INFO[card.name].requiresTarget ||
        card.name === "ResourceMonopoly" ||
        card.name === "TradeMonopoly" ||
        card.name === "MerchantFleet" ||
        card.name === "Crane" ||
        card.name === "RoadBuilding" ||
        card.name === "Smithing" ||
        card.name === "Medicine" ||
        card.name === "Engineering" ||
        card.name === "Merchant" ||
        card.name === "Invention" ||
        card.name === "Taxation" ||
        card.name === "CommercialHarbor" ||
        (card.name === "Espionage" && !!selectedTargetPid && espTargetCards.length > 0) ||
        (card.name === "GuildDues" && !!selectedTargetPid && gdTargetResources.length > 0) ||
        card.name === "Intrigue" ||
        card.name === "Treason" ||
        card.name === "Diplomacy"))}
    {#if card.name === "Alchemy" && alchemyLateMessage && !canPlayNow}
      <p id="alchemy-late-message" class="inline-status" role="status" aria-live="polite">
        Use Alchemy before rolling the dice next turn.
      </p>
    {/if}
    <button
      class="confirm"
      type="button"
      onclick={playProgress}
      disabled={!canUseState.enabled}
      aria-describedby={card.name === "Alchemy" && alchemyLateMessage && !canPlayNow
        ? "alchemy-late-message"
        : undefined}
    >
      Use Card
    </button>
  {/if}
</div>

<style>
  .helper {
    margin: 0.6rem 0 0;
    font-size: 0.76rem;
    color: #c8b47a;
    line-height: 1.35;
  }

  .actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-top: 0.8rem;
  }

  .inline-status {
    margin: 0;
    margin-right: auto;
    max-width: 16rem;
    font-size: 0.74rem;
    color: #f6d38c;
    line-height: 1.35;
  }

  .picker-row {
    margin-top: 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .picker-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }

  .picker-row label {
    font-size: 0.72rem;
    text-transform: uppercase;
    color: #c8b47a;
    letter-spacing: 0.04em;
  }

  .picker-row select {
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: #1a2a1a;
    color: #f0e8d0;
    padding: 0.3rem 0.4rem;
    font-size: 0.82rem;
  }

  .confirm {
    background: #3a5e1e;
    color: #f5c842;
    border: 1px solid #6dbf6d;
    border-radius: 7px;
    padding: 0.4rem 0.75rem;
    font-size: 0.82rem;
    font-weight: 700;
  }

  .board-select-btn {
    background: #3a5e1e;
    color: #f5c842;
    border: 1px solid #6dbf6d;
    border-radius: 7px;
    padding: 0.4rem 0.75rem;
    font-size: 0.79rem;
    font-weight: 600;
    cursor: pointer;
    margin-top: 0.6rem;
    width: 100%;
  }

  .board-select-btn:hover {
    background: #4a7a28;
  }

  .board-select-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    filter: grayscale(0.2);
  }
</style>
