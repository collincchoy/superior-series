<script lang="ts">
  import { store } from "../../lib/catan/store.svelte.js";
  import ResourceKeyGrid from "./ResourceKeyGrid.svelte";
  import ImprovementTrackGrid from "./ImprovementTrackGrid.svelte";
  import PlayerChipBar from "./PlayerChipBar.svelte";
  import { PROGRESS_CARD_INFO } from "../../lib/catan/constants.js";
  import ResourceCard from "./ResourceCard.svelte";
  import Die from "./Die.svelte";
  import type {
    CommodityType,
    EdgeId,
    HexId,
    ImprovementTrack,
    PlayerId,
    ProgressCard,
    ResourceType,
    Resources,
    VertexId,
  } from "../../lib/catan/types.js";
  import {
    BASIC_RESOURCE_KEYS,
    COMMODITY_KEYS,
    RESOURCE_KEYS,
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

  let selectedResource = $state<ResourceType>("grain");
  let selectedCommodity = $state<CommodityType>("cloth");
  let selectedCardType = $state<keyof Resources>("cloth");
  let selectedCraneTrack = $state<ImprovementTrack>("science");
  let die1 = $state(1);
  let die2 = $state(1);

  let selectedTargetPid = $state<PlayerId | null>(null);
  let selectedEspCardIndex = $state<number>(0);
  let gdStep = $state<1 | 2>(1);
  let gdLockedPid = $state<PlayerId | null>(null);
  let gdSelectedIndices = $state<number[]>([]);
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

  let espionagePlayers = $derived(
    gs && myPid
      ? (opponents.filter(
          (p) =>
            (gs.players[p]?.progressCards ?? []).filter((c) => !c.isVP).length >
            0,
        ) as PlayerId[])
      : ([] as PlayerId[]),
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

  let gdExpandedHand = $derived.by(() => {
    if (!gs || !gdLockedPid) return [] as (keyof Resources)[];
    const res = gs.players[gdLockedPid]?.resources ?? {};
    const cards: (keyof Resources)[] = [];
    for (const key of RESOURCE_KEYS) {
      for (let i = 0; i < (res[key] ?? 0); i++) cards.push(key);
    }
    return cards;
  });

  $effect(() => {
    if (card.name !== "Alchemy") {
      alchemyLateMessage = false;
      return;
    }
    if (canPlayNow) alchemyLateMessage = false;
  });

  $effect(() => {
    void card.name;
    gdStep = 1;
    gdLockedPid = null;
    gdSelectedIndices = [];
  });

  $effect(() => {
    if (card.name !== "Espionage" || !canPlayNow || !gs) return;
    if (espionagePlayers.length === 0) return;
    if (
      selectedTargetPid === null ||
      !espionagePlayers.includes(selectedTargetPid)
    ) {
      selectedTargetPid = espionagePlayers[0]!;
    }
  });

  function close() {
    onClose();
  }

  function getBoardTargetPendingAction(): PendingAction | null {
    switch (card.name) {
      case "Medicine":
        return { type: "progress_select_vertex", card: "Medicine" };
      case "Engineering":
        return { type: "progress_select_vertex", card: "Engineering" };
      case "Merchant":
        return { type: "progress_select_hex", card: "Merchant" };
      case "Invention":
        return { type: "progress_select_hex_pair", card: "Invention", picked: [] };
      case "Taxation":
        return { type: "progress_select_hex", card: "Taxation" };
      case "Intrigue":
        return { type: "progress_select_knight", card: "Intrigue" };
      case "Treason":
        return { type: "progress_select_knight", card: "Treason" };
      case "Diplomacy":
        return { type: "progress_select_edge", card: "Diplomacy" };
      default:
        return null;
    }
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
      if (gdStep === 1) {
        if (!selectedTargetPid) return;
        gdLockedPid = selectedTargetPid;
        gdSelectedIndices = [];
        gdStep = 2;
        return;
      }
      if (gdStep === 2) {
        if (!gdLockedPid) return;
        const takeCards: Partial<Resources> = {};
        for (const idx of gdSelectedIndices) {
          const key = gdExpandedHand[idx];
          if (key) takeCards[key] = (takeCards[key] ?? 0) + 1;
        }
        store.sendAction({ type: "PLAY_PROGRESS", pid, card: "GuildDues", params: { targetPid: gdLockedPid, takeCards } });
        close();
        return;
      }
    }

    const boardTargetPendingAction = getBoardTargetPendingAction();
    if (boardTargetPendingAction) {
      store.setPendingAction(boardTargetPendingAction);
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
    <span class="picker-label" id="res-mon-grid-label">Resource</span>
    <ResourceKeyGrid
      labelledby="res-mon-grid-label"
      keys={[...BASIC_RESOURCE_KEYS]}
      selected={selectedResource}
      onSelect={(k) => (selectedResource = k as ResourceType)}
    />
  </div>
{:else if canPlayNow && card.name === "TradeMonopoly"}
  <div class="picker-row">
    <span class="picker-label" id="trade-mon-grid-label">Commodity</span>
    <ResourceKeyGrid
      labelledby="trade-mon-grid-label"
      keys={[...COMMODITY_KEYS]}
      selected={selectedCommodity}
      onSelect={(k) => (selectedCommodity = k as CommodityType)}
    />
  </div>
{:else if canPlayNow && card.name === "Alchemy"}
  <div class="alchemy-picker">
    <div class="die-row">
      <span class="die-label yellow-label">Yellow Die</span>
      <div class="die-options">
        {#each [1, 2, 3, 4, 5, 6] as v (v)}
          <button
            class="die-btn"
            class:selected={die1 === v}
            type="button"
            aria-label={`Yellow die ${v}`}
            aria-pressed={die1 === v}
            onclick={() => (die1 = v)}
          >
            <Die color="yellow" value={v} size="2.2rem" />
          </button>
        {/each}
      </div>
    </div>
    <div class="die-row">
      <span class="die-label red-label">Red Die</span>
      <div class="die-options">
        {#each [1, 2, 3, 4, 5, 6] as v (v)}
          <button
            class="die-btn"
            class:selected={die2 === v}
            type="button"
            aria-label={`Red die ${v}`}
            aria-pressed={die2 === v}
            onclick={() => (die2 = v)}
          >
            <Die color="red" value={v} size="2.2rem" />
          </button>
        {/each}
      </div>
    </div>
    <div class="alchemy-sum">Total: {die1 + die2}</div>
  </div>
{:else if canPlayNow && card.name === "MerchantFleet"}
  <div class="picker-row">
    <span class="picker-label" id="fleet-grid-label">2:1 card type</span>
    <ResourceKeyGrid
      labelledby="fleet-grid-label"
      keys={[...RESOURCE_KEYS]}
      selected={selectedCardType}
      onSelect={(k) => (selectedCardType = k)}
    />
  </div>
{:else if canPlayNow && card.name === "Crane"}
  <div class="picker-row">
    <span class="picker-label" id="crane-grid-label">Discount track</span>
    <ImprovementTrackGrid
      labelledby="crane-grid-label"
      selected={selectedCraneTrack}
      onSelect={(t) => (selectedCraneTrack = t)}
    />
  </div>
{:else if canPlayNow && card.name === "Medicine"}
  <p class="helper">Click a settlement on the board to upgrade it.</p>
{:else if canPlayNow && card.name === "Engineering"}
  <p class="helper">Click a city on the board to add a wall.</p>
{:else if canPlayNow && card.name === "Merchant"}
  <p class="helper">Click a land hex adjacent to your buildings to place the merchant.</p>
{:else if canPlayNow && card.name === "Invention"}
  <p class="helper">Click two number hexes (not 2, 6, 8, or 12) to swap their values.</p>
{:else if canPlayNow && card.name === "Taxation"}
  {#if !gs?.barbarian.robberActive}
    <p class="helper" style="color:#f87171">Taxation requires the robber to be active (after first barbarian attack).</p>
  {:else}
    <p class="helper">Click a hex to move the robber there.</p>
  {/if}
{:else if canPlayNow && card.name === "CommercialHarbor"}
  <div class="picker-row">
    <span class="picker-label" id="ch-res-grid-label">Offer resource</span>
    <ResourceKeyGrid
      labelledby="ch-res-grid-label"
      keys={[...BASIC_RESOURCE_KEYS]}
      selected={selectedComHarborResource}
      onSelect={(k) => (selectedComHarborResource = k as ResourceType)}
    />
  </div>
{:else if canPlayNow && card.name === "Espionage"}
  <div class="picker-row">
    <span class="picker-label">Target player</span>
    {#if gs}
      <PlayerChipBar
        mode="single"
        playerIds={espionagePlayers}
        gameState={gs}
        bind:selectedSingle={selectedTargetPid}
      />
    {/if}
  </div>
  {#if selectedTargetPid && espTargetCards.length > 0}
    <div class="picker-row">
      <label for="esp-card">Card to steal</label>
      <select id="esp-card" bind:value={selectedEspCardIndex}>
        {#each espTargetCards as targetCard, i (`${targetCard.name}-${i}`)}
          <option value={i}>{targetCard.name}</option>
        {/each}
      </select>
    </div>
  {:else if selectedTargetPid}
    <p class="helper" style="color:#94a3b8">That player has no stealable cards.</p>
  {/if}
{:else if canPlayNow && card.name === "GuildDues"}
  {#if gdStep === 1}
    <p class="gd-step-label">TARGET PLAYER (&gt;= YOUR VP)</p>
    {#if gs}
      <PlayerChipBar
        mode="single"
        playerIds={opponentsGdEligible}
        gameState={gs}
        bind:selectedSingle={selectedTargetPid}
      />
    {/if}
  {:else if gdStep === 2 && gdLockedPid && gs}
    {@const lockedName = gs.players[gdLockedPid]?.name ?? gdLockedPid}
    <p class="gd-step-label">SELECT UP TO 2 CARDS FROM {lockedName.toUpperCase()}'S HAND</p>
    {#if gdExpandedHand.length === 0}
      <p class="helper" style="color:#94a3b8">That player has no cards to take.</p>
    {:else}
      <div class="gd-hand">
        {#each gdExpandedHand as cardKey, i (`${cardKey}-${i}`)}
          {@const isSelected = gdSelectedIndices.includes(i)}
          {@const canSelect = isSelected || gdSelectedIndices.length < 2}
          <ResourceCard
            {cardKey}
            selected={isSelected}
            disabled={!canSelect}
            onclick={() => {
              if (isSelected) {
                gdSelectedIndices = gdSelectedIndices.filter((x) => x !== i);
              } else if (gdSelectedIndices.length < 2) {
                gdSelectedIndices = [...gdSelectedIndices, i];
              }
            }}
          />
        {/each}
      </div>
      <p class="gd-count">{gdSelectedIndices.length} / 2 selected</p>
    {/if}
  {/if}
{:else if canPlayNow && card.name === "Intrigue"}
  <p class="helper">Click an enemy knight on your network to displace it.</p>
{:else if canPlayNow && card.name === "Treason"}
  <p class="helper">Click an enemy knight to remove it.</p>
{:else if canPlayNow && card.name === "Diplomacy"}
  <p class="helper">Click an open road (yours or an opponent's) to remove it.</p>
{/if}

<div class="actions">
  {#if card.name === "GuildDues" && canPlayNow}
    {#if gdStep === 1}
      <button
        class="confirm"
        type="button"
        onclick={playProgress}
        disabled={!canUseState.enabled || !selectedTargetPid}
      >
        Use Card
      </button>
    {:else if gdStep === 2}
      <button
        class="confirm"
        type="button"
        onclick={playProgress}
        disabled={gdSelectedIndices.length === 0}
      >
        Confirm
      </button>
    {/if}
  {:else if card.name === "Alchemy" ||
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

  .picker-row label,
  .picker-label {
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

  .alchemy-picker {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-top: 0.5rem;
  }

  .die-row {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .die-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 700;
  }

  .yellow-label {
    color: #f6d55c;
  }

  .red-label {
    color: #e07070;
  }

  .die-options {
    display: flex;
    gap: 0.3rem;
  }

  .die-btn {
    background: transparent;
    border: 2px solid transparent;
    border-radius: 6px;
    padding: 0.2rem;
    cursor: pointer;
    line-height: 0;
    opacity: 0.55;
    transition: opacity 0.1s, border-color 0.1s, box-shadow 0.1s;
  }

  .die-btn:hover {
    opacity: 0.85;
  }

  .die-btn.selected {
    opacity: 1;
    border-color: rgba(255, 255, 255, 0.8);
    box-shadow: 0 0 6px rgba(255, 255, 255, 0.4);
  }

  .alchemy-sum {
    font-size: 0.8rem;
    color: #c8b47a;
    font-weight: 700;
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

  .gd-step-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    color: #c8b47a;
    letter-spacing: 0.04em;
    margin-top: 0.6rem;
    margin-bottom: 0;
  }

  .gd-hand {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 0.5rem;
  }

  .gd-count {
    font-size: 0.72rem;
    color: #c8b47a;
    margin-top: 0.35rem;
    margin-bottom: 0;
  }
</style>
