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
  import { buildGraph } from "../../lib/catan/board.js";
  import { computeVP } from "../../lib/catan/game.js";
  import { isOnPlayerNetwork, isOpenRoad } from "../../lib/catan/rules.js";

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

  const graph = buildGraph();

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

  let selectedVid = $state<VertexId | null>(null);
  let selectedHid = $state<HexId | null>(null);
  let selectedHid2 = $state<HexId | null>(null);
  let selectedTargetPid = $state<PlayerId | null>(null);
  let selectedEspCardIndex = $state<number>(0);
  let gdResource1 = $state<keyof Resources>("grain");
  let gdResource2 = $state<keyof Resources>("grain");
  let selectedOpKnightVid = $state<VertexId | null>(null);
  let selectedDipEid = $state<EdgeId | null>(null);
  let selectedComHarborResource = $state<ResourceType>("grain");
  let alchemyLateMessage = $state(false);

  let gs = $derived(store.gameState);
  let myPid = $derived(store.localPid);

  let mySettlements = $derived(
    gs && myPid
      ? Object.entries(gs.board.vertices)
          .filter(([, v]) => v?.type === "settlement" && v.playerId === myPid)
          .map(([vid]) => vid as VertexId)
      : [],
  );

  let myUnwalledCities = $derived(
    gs && myPid
      ? Object.entries(gs.board.vertices)
          .filter(
            ([, v]) =>
              v?.type === "city" && v.playerId === myPid && !(v as any).hasWall,
          )
          .map(([vid]) => vid as VertexId)
      : [],
  );

  let hexesAdjacentToMe = $derived((): HexId[] => {
    if (!gs || !myPid) return [];
    const myVids = new Set(
      Object.entries(gs.board.vertices)
        .filter(([, v]) => v?.playerId === myPid)
        .map(([vid]) => vid),
    );
    return Object.entries(gs.board.hexes)
      .filter(
        ([hid, hex]) =>
          hex.terrain !== "desert" &&
          hex.number &&
          (graph.verticesOfHex[hid] ?? []).some((v) => myVids.has(v)),
      )
      .map(([hid]) => hid as HexId);
  });

  let numberableHexes = $derived(
    gs
      ? Object.entries(gs.board.hexes)
          .filter(([, hex]) => hex.number && ![2, 6, 8, 12].includes(hex.number))
          .map(([hid]) => hid as HexId)
      : [],
  );

  let eligibleRobberHexes = $derived(
    gs?.barbarian.robberActive
      ? Object.entries(gs.board.hexes)
          .filter(([, hex]) => hex.terrain !== "desert")
          .map(([hid]) => hid as HexId)
      : ([] as HexId[]),
  );

  let opponents = $derived(
    gs && myPid ? (gs.playerOrder.filter((p) => p !== myPid) as PlayerId[]) : ([] as PlayerId[]),
  );

  let opponentsGdEligible = $derived(
    gs && myPid
      ? opponents.filter((p) => computeVP(gs, p) >= computeVP(gs, myPid))
      : ([] as PlayerId[]),
  );

  let opponentKnightsOnNetwork = $derived((): VertexId[] => {
    if (!gs || !myPid) return [];
    return Object.entries(gs.board.knights)
      .filter(
        ([vid, k]) =>
          !!k &&
          k.playerId !== myPid &&
          isOnPlayerNetwork(gs.board, graph, myPid, vid as VertexId),
      )
      .map(([vid]) => vid as VertexId);
  });

  let allOpponentKnights = $derived(
    gs && myPid
      ? Object.entries(gs.board.knights)
          .filter(([, k]) => !!k && k.playerId !== myPid)
          .map(([vid]) => vid as VertexId)
      : ([] as VertexId[]),
  );

  let openRoadEdges = $derived(
    gs
      ? Object.entries(gs.board.edges)
          .filter(([eid, road]) => !!road && isOpenRoad(gs.board, graph, eid as EdgeId))
          .map(([eid]) => eid as EdgeId)
      : ([] as EdgeId[]),
  );

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

    if (card.name === "Medicine") {
      if (!selectedVid) return;
      store.sendAction({ type: "PLAY_PROGRESS", pid, card: "Medicine", params: { vid: selectedVid } });
      close();
      return;
    }

    if (card.name === "Engineering") {
      if (!selectedVid) return;
      store.sendAction({ type: "PLAY_PROGRESS", pid, card: "Engineering", params: { vid: selectedVid } });
      close();
      return;
    }

    if (card.name === "Merchant") {
      if (!selectedHid) return;
      store.sendAction({ type: "PLAY_PROGRESS", pid, card: "Merchant", params: { hid: selectedHid } });
      close();
      return;
    }

    if (card.name === "Invention") {
      if (!selectedHid || !selectedHid2 || selectedHid === selectedHid2) return;
      store.sendAction({ type: "PLAY_PROGRESS", pid, card: "Invention", params: { hid1: selectedHid, hid2: selectedHid2 } });
      close();
      return;
    }

    if (card.name === "Taxation") {
      if (!selectedHid) return;
      store.sendAction({ type: "PLAY_PROGRESS", pid, card: "Taxation", params: { hid: selectedHid } });
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

    if (card.name === "Intrigue") {
      if (!selectedOpKnightVid) return;
      store.sendAction({ type: "PLAY_PROGRESS", pid, card: "Intrigue", params: { vid: selectedOpKnightVid } });
      close();
      return;
    }

    if (card.name === "Treason") {
      if (!selectedOpKnightVid) return;
      store.sendAction({ type: "PLAY_PROGRESS", pid, card: "Treason", params: { vid: selectedOpKnightVid } });
      close();
      return;
    }

    if (card.name === "Diplomacy") {
      if (!selectedDipEid) return;
      store.sendAction({ type: "PLAY_PROGRESS", pid, card: "Diplomacy", params: { eid: selectedDipEid } });
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

<p class="helper">{helperText}</p>

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
  <div class="picker-row">
    <label for="med-vid">Your settlement</label>
    <select id="med-vid" bind:value={selectedVid}>
      {#each mySettlements as vid}
        <option value={vid}>{vid}</option>
      {/each}
    </select>
  </div>
{:else if canPlayNow && card.name === "Engineering"}
  <div class="picker-row">
    <label for="eng-vid">City to wall</label>
    <select id="eng-vid" bind:value={selectedVid}>
      {#each myUnwalledCities as vid}
        <option value={vid}>{vid}</option>
      {/each}
    </select>
  </div>
{:else if canPlayNow && card.name === "Merchant"}
  <div class="picker-row">
    <label for="merch-hid">Place on hex</label>
    <select id="merch-hid" bind:value={selectedHid}>
      {#each hexesAdjacentToMe() as hid}
        <option value={hid}>{hid}</option>
      {/each}
    </select>
  </div>
{:else if canPlayNow && card.name === "Invention"}
  <div class="picker-grid">
    <div class="picker-row">
      <label for="inv-hid1">Hex 1</label>
      <select id="inv-hid1" bind:value={selectedHid}>
        {#each numberableHexes as hid}
          <option value={hid}>{gs?.board.hexes[hid]?.number ?? hid}</option>
        {/each}
      </select>
    </div>
    <div class="picker-row">
      <label for="inv-hid2">Hex 2</label>
      <select id="inv-hid2" bind:value={selectedHid2}>
        {#each numberableHexes as hid}
          <option value={hid}>{gs?.board.hexes[hid]?.number ?? hid}</option>
        {/each}
      </select>
    </div>
  </div>
{:else if canPlayNow && card.name === "Taxation"}
  {#if eligibleRobberHexes.length === 0}
    <p class="helper" style="color:#f87171">Taxation requires the robber to be active (after first barbarian attack).</p>
  {:else}
    <div class="picker-row">
      <label for="tax-hid">Move robber to</label>
      <select id="tax-hid" bind:value={selectedHid}>
        {#each eligibleRobberHexes as hid}
          <option value={hid}>{gs?.board.hexes[hid]?.terrain} ({gs?.board.hexes[hid]?.number ?? "?"})</option>
        {/each}
      </select>
    </div>
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
  {#if opponentKnightsOnNetwork().length === 0}
    <p class="helper" style="color:#f87171">No eligible enemy knights adjacent to your network.</p>
  {:else}
    <div class="picker-row">
      <label for="int-vid">Enemy knight to displace</label>
      <select id="int-vid" bind:value={selectedOpKnightVid}>
        {#each opponentKnightsOnNetwork() as vid}
          {@const k = gs?.board.knights[vid]}
          <option value={vid}>{gs?.players[k?.playerId ?? ""]?.name ?? k?.playerId} strength {k?.strength} at {vid}</option>
        {/each}
      </select>
    </div>
  {/if}
{:else if canPlayNow && card.name === "Treason"}
  {#if allOpponentKnights.length === 0}
    <p class="helper" style="color:#f87171">No enemy knights on the board.</p>
  {:else}
    <div class="picker-row">
      <label for="trs-vid">Enemy knight to remove</label>
      <select id="trs-vid" bind:value={selectedOpKnightVid}>
        {#each allOpponentKnights as vid}
          {@const k = gs?.board.knights[vid]}
          <option value={vid}>{gs?.players[k?.playerId ?? ""]?.name ?? k?.playerId} strength {k?.strength} at {vid}</option>
        {/each}
      </select>
    </div>
  {/if}
{:else if canPlayNow && card.name === "Diplomacy"}
  {#if openRoadEdges.length === 0}
    <p class="helper" style="color:#f87171">No open roads on the board.</p>
  {:else}
    <div class="picker-row">
      <label for="dip-eid">Road to remove</label>
      <select id="dip-eid" bind:value={selectedDipEid}>
        {#each openRoadEdges as eid}
          {@const road = gs?.board.edges[eid]}
          <option value={eid}>{gs?.players[road?.playerId ?? ""]?.name ?? road?.playerId}'s road</option>
        {/each}
      </select>
    </div>
  {/if}
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
        (card.name === "Medicine" && mySettlements.length > 0) ||
        (card.name === "Engineering" && myUnwalledCities.length > 0) ||
        (card.name === "Merchant" && hexesAdjacentToMe().length > 0) ||
        (card.name === "Invention" && numberableHexes.length >= 2) ||
        (card.name === "Taxation" && eligibleRobberHexes.length > 0) ||
        card.name === "CommercialHarbor" ||
        (card.name === "Espionage" && !!selectedTargetPid && espTargetCards.length > 0) ||
        (card.name === "GuildDues" && !!selectedTargetPid && gdTargetResources.length > 0) ||
        (card.name === "Intrigue" && opponentKnightsOnNetwork().length > 0 && !!selectedOpKnightVid) ||
        (card.name === "Treason" && allOpponentKnights.length > 0 && !!selectedOpKnightVid) ||
        (card.name === "Diplomacy" && openRoadEdges.length > 0 && !!selectedDipEid)))}
    {#if card.name === "Alchemy" && alchemyLateMessage && !canPlayNow}
      <p id="alchemy-late-message" class="inline-status" role="status" aria-live="polite">
        Use Alchemy before rolling the dice next turn.
      </p>
    {/if}
    <button
      class="confirm"
      type="button"
      onclick={playProgress}
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
</style>
