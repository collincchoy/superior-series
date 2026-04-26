<script lang="ts">
  import type {
    GameState,
    PlayerId,
    GameAction,
    ImprovementTrack,
    VertexId,
    Resources,
  } from "../../lib/catan/types.js";
  import type { PendingAction } from "../../lib/catan/validTargets.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import { CARD_EMOJI } from "./cardEmoji.js";
  import {
    canBuildRoad,
    canBuildSettlement,
    canBuildCity,
    canBuildCityWall,
    canRecruitKnight,
    canPromoteKnight,
    canActivateKnight,
    canImproveCity,
    canRelocateDisplacedKnight,
    canDisplaceKnight,
    canChaseRobber,
    playerHasCity,
  } from "../../lib/catan/rules.js";
  import { buildGraph } from "../../lib/catan/board.js";
  import { TRACK_COMMODITY, BUILD_COSTS } from "../../lib/catan/constants.js";
  import CatanPopover from "./CatanPopover.svelte";

  const BUILD_ACTION_TYPES = new Set([
    "build_road", "build_settlement", "build_city", "build_city_wall",
  ]);
  const KNIGHT_ACTION_TYPES = new Set([
    "recruit_knight", "promote_knight", "activate_knight",
    "move_knight_from", "move_knight_to",
    "displace_knight_from", "displace_knight_to",
    "chase_robber_from", "chase_robber_hex",
  ]);

  const scienceResources: (keyof Resources)[] = [
    "brick",
    "lumber",
    "ore",
    "grain",
    "wool",
  ];
  let {
    gameState,
    localPid,
    pendingAction,
    showTrade = $bindable(false),
    showPlayerTrade = $bindable(false),
  }: {
    gameState: GameState;
    localPid: PlayerId;
    pendingAction: PendingAction | null;
    showTrade: boolean;
    showPlayerTrade: boolean;
  } = $props();

  const graph = buildGraph();

  function send(action: GameAction) {
    store.sendAction(action);
  }
  function pending(pa: PendingAction | null) {
    store.setPendingAction(pa);
  }
  function canPromoteAt(vid: VertexId) {
    return canPromoteKnight(board, me, vid);
  }
  function canActivateAt(vid: VertexId) {
    return canActivateKnight(board, me, vid);
  }
  function canRelocateDisplacedTo(vid: VertexId) {
    if (gameState.phase !== "KNIGHT_DISPLACE_RESPONSE") return false;
    if (gameState.pendingDisplace?.displacedPlayerId !== pid) return false;
    return canRelocateDisplacedKnight(
      board,
      graph,
      pid,
      gameState.pendingDisplace.displacedKnightVertex,
      vid,
    );
  }

  let board = $derived(gameState.board);
  let me = $derived(gameState.players[localPid]!);
  let pid = $derived(localPid);
  let activatedThisTurn = $derived(new Set(gameState.knightsActivatedThisTurn));

  let pendingTrade = $derived(gameState.pendingTradeOffer);
  let waitingForTradeResponse = $derived(pendingTrade?.initiatorPid === pid);
  let tradeOfferForMe = $derived(pendingTrade?.targetPids.includes(pid) ?? false);

  let canRoad = $derived(
    Object.keys(graph.edges).some((eid) =>
      canBuildRoad(board, graph, me, eid as any),
    ),
  );
  let canSettle = $derived(
    Object.keys(graph.vertices).some((vid) =>
      canBuildSettlement(board, graph, me, vid as any),
    ),
  );
  let canCity = $derived(
    Object.entries(board.vertices).some(
      ([vid, b]) =>
        b?.type === "settlement" &&
        b.playerId === pid &&
        canBuildCity(board, me, vid as any),
    ),
  );
  let canWall = $derived(
    Object.entries(board.vertices).some(
      ([vid, b]) =>
        b?.type === "city" &&
        b.playerId === pid &&
        !b.hasWall &&
        canBuildCityWall(board, me, vid as any),
    ),
  );
  let canKnight = $derived(
    Object.keys(graph.vertices).some((vid) =>
      canRecruitKnight(board, graph, me, vid as any),
    ),
  );
  let canPromote = $derived(
    Object.entries(board.knights).some(
      ([vid, k]) => k?.playerId === pid && canPromoteAt(vid as VertexId),
    ),
  );
  let canActivate = $derived(
    Object.entries(board.knights).some(
      ([vid, k]) => k?.playerId === pid && canActivateAt(vid as VertexId),
    ),
  );
  let canMove = $derived(
    Object.entries(board.knights).some(
      ([vid, k]) =>
        k?.playerId === pid &&
        k.active &&
        !activatedThisTurn.has(vid as VertexId),
    ),
  );
  let canDisplace = $derived(
    Object.entries(board.knights).some(([fromVid, k]) => {
      if (
        !k ||
        k.playerId !== pid ||
        !k.active ||
        activatedThisTurn.has(fromVid as VertexId)
      ) return false;
      return Object.entries(board.knights).some(
        ([toVid, t]) =>
          t !== null &&
          t.playerId !== pid &&
          canDisplaceKnight(board, graph, pid, fromVid as VertexId, toVid as VertexId),
      );
    }),
  );
  let canChaseRobberNow = $derived(
    gameState.barbarian.robberActive &&
      Object.entries(board.knights).some(([vid, k]) =>
        k?.playerId === pid &&
        !activatedThisTurn.has(vid as VertexId) &&
        canChaseRobber(board, graph, pid, vid as VertexId),
      ),
  );
  let canRelocateDisplaced = $derived.by(() =>
    Object.keys(graph.vertices).some((vid) =>
      canRelocateDisplacedTo(vid as VertexId),
    ),
  );

  const tracks: ImprovementTrack[] = ["science", "trade", "politics"];
  const trackLabel: Record<ImprovementTrack, { label: string; color: string }> = {
    science: { label: "🔬 Science", color: "#2e9e4f" },
    trade: { label: "🤝 Trade", color: "#f1c232" },
    politics: { label: "⚔️ Politics", color: "#2f6fe4" },
  };

  let hasCity = $derived(playerHasCity(board, pid));
  let craneDiscount = $derived(gameState.progressEffects.craneDiscountPlayerId === pid);

  const RESOURCE_COLORS: Record<keyof Resources, string> = {
    brick: "#c8622a",
    lumber: "#2d7a2d",
    ore: "#7a7a7a",
    grain: "#d4b800",
    wool: "#6dbf6d",
    cloth: "#f1c232",
    coin: "#2f6fe4",
    paper: "#2e9e4f",
  };

  type PopoverState = {
    x: number;
    y: number;
    title: string;
    cost: Partial<Resources>;
    reason?: string;
  };
  let popover = $state<PopoverState | null>(null);

  function closeUnavailablePopover() {
    popover = null;
  }

  function showUnavailablePopover(
    event: MouseEvent,
    title: string,
    cost: Partial<Resources>,
    reason?: string,
  ) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(rect.left, window.innerWidth - 236);
    popover = { x, y: rect.bottom + 6, title, cost, reason };
  }

  function hasEnough(cost: Partial<Resources>): boolean {
    return Object.entries(cost).every(
      ([k, v]) => (me.resources[k as keyof Resources] ?? 0) >= (v ?? 0),
    );
  }

  function roadReason(): string | undefined {
    if (me.supply.roads <= 0) return "No road pieces left.";
    if (hasEnough(BUILD_COSTS.road)) return "No valid road placement on the board.";
  }
  function settlementReason(): string | undefined {
    if (me.supply.settlements <= 0) return "No settlement pieces left.";
    if (hasEnough(BUILD_COSTS.settlement)) {
      return "No valid settlement spot (distance/network rules).";
    }
  }
  function cityReason(): string | undefined {
    if (me.supply.cities <= 0) return "No city pieces left.";
    if (hasEnough(BUILD_COSTS.city)) return "No settlement available to upgrade.";
  }
  function wallReason(): string | undefined {
    if (me.supply.cityWalls <= 0) return "No city wall pieces left.";
    if (hasEnough(BUILD_COSTS.cityWall)) return "No eligible city without a wall.";
  }
  function recruitKnightReason(): string | undefined {
    if (me.supply.knights[1] <= 0) return "No basic knight pieces left (promote one first).";
    if (hasEnough(BUILD_COSTS.knightRecruit)) {
      return "No valid knight placement (must connect to your route).";
    }
  }
  function promoteKnightReason(): string | undefined {
    const mine = Object.entries(board.knights).filter(([, k]) => k?.playerId === pid);
    if (mine.length === 0) return "No knights on the board to promote.";
    const anyPromotable = mine.some(([vid]) => canPromoteAt(vid as VertexId));
    if (!anyPromotable) {
      const hasStrong = mine.some(([, k]) => k!.strength === 2);
      if (hasStrong && me.improvements.politics < 3) {
        return "Need Politics level 3+ to promote strong knights to mighty.";
      }
      return "No promotable knights available.";
    }
  }
  function activateKnightReason(): string | undefined {
    const mine = Object.entries(board.knights).filter(([, k]) => k?.playerId === pid);
    if (mine.length === 0) return "No knights on the board.";
    if (mine.every(([, k]) => k!.active)) return "All of your knights are already active.";
  }
  function moveKnightReason(): string | undefined {
    const mine = Object.entries(board.knights).filter(([, k]) => k?.playerId === pid);
    if (mine.length === 0) return "No knights on the board.";
    if (mine.every(([, k]) => !k!.active)) return "No active knights to move (activate one first).";
    if (mine.some(([vid, k]) => k!.active && activatedThisTurn.has(vid as VertexId))) {
      return "A knight activated this turn cannot take a knight action until next turn.";
    }
  }
  function displaceKnightReason(): string | undefined {
    const active = Object.entries(board.knights).filter(
      ([, k]) => k?.playerId === pid && k.active,
    );
    if (active.length === 0) return "No active knights to attack with.";
    if (active.some(([vid]) => activatedThisTurn.has(vid as VertexId))) {
      return "A knight activated this turn cannot take a knight action until next turn.";
    }
    return "No weaker opponent knights are reachable from your knights.";
  }
  function chaseRobberReason(): string | undefined {
    const active = Object.entries(board.knights).filter(
      ([, k]) => k?.playerId === pid && k.active,
    );
    if (active.length === 0) return "No active knights. Activate a knight adjacent to the robber.";
    if (active.some(([vid]) => activatedThisTurn.has(vid as VertexId))) {
      return "A knight activated this turn cannot take a knight action until next turn.";
    }
    return "No active knight is adjacent to the robber.";
  }
  function improveCost(track: ImprovementTrack): Partial<Resources> {
    const level = me.improvements[track];
    if (level >= 5) return {};
    const commodity = TRACK_COMMODITY[track];
    const cost = Math.max(0, level + 1 - (craneDiscount ? 1 : 0));
    return { [commodity]: cost } as Partial<Resources>;
  }
  function improveReason(track: ImprovementTrack): string | undefined {
    if (!hasCity) return "Requires at least one city on the board.";
    if (me.improvements[track] >= 5) return "Already at maximum level.";
    const targetLevel = me.improvements[track] + 1;
    if (
      targetLevel >= 4 &&
      gameState.metropolisOwner[track] !== pid &&
      !Object.values(board.vertices).some(
        (v) => v?.type === "city" && v.playerId === pid && v.metropolis === null,
      )
    ) {
      return "Build a city first — all your cities already hold a metropolis.";
    }
  }

  let activeTab = $state<"build" | "knights" | "improve">("build");

  const TRACK_ABILITY_SHORT: Record<ImprovementTrack, string> = {
    science: "Inventor",
    trade: "Master Merchant",
    politics: "Bishop of Catan",
  };

  $effect(() => {
    if (!pendingAction) return;
    if (BUILD_ACTION_TYPES.has(pendingAction.type)) activeTab = "build";
    else if (KNIGHT_ACTION_TYPES.has(pendingAction.type)) activeTab = "knights";
  });

  function metroPipIndex(
    metroOwner: PlayerId | null,
    pid: PlayerId,
    level: number,
    ownerLevel: number,
  ): number | null {
    if (metroOwner === null) return 3;
    if (metroOwner === pid) return level - 1;
    return ownerLevel < 5 ? 4 : null;
  }

  function showBuildInfo() {
    store.openInfoModal({ kind: "build-costs" });
  }

  function showKnightInfo() {
    store.openInfoModal({ kind: "knight-levels" });
  }
</script>

<div class="action-panel">
  {#if gameState.phase === "SETUP_R1_SETTLEMENT"}
    <p class="action-instruction">
      👆 Click a yellow dot on the board to place your settlement
    </p>
  {:else if gameState.phase === "SETUP_R1_ROAD"}
    <p class="action-instruction">
      👆 Click a yellow line on the board to place your road
    </p>
  {:else if gameState.phase === "SETUP_R2_CITY"}
    <p class="action-instruction">
      👆 Click a yellow dot on the board to place your city
    </p>
  {:else if gameState.phase === "SETUP_R2_ROAD"}
    <p class="action-instruction">
      👆 Click a yellow line on the board to place your road
    </p>
  {:else if gameState.phase === "DISCARD_PROGRESS" && (gameState.pendingProgressDiscard?.remaining[pid] ?? 0) > 0}
    <p class="action-instruction">
      Preview a card, discard it, then repeat if you still owe discards.
    </p>
  {:else if gameState.phase === "RESOLVE_PROGRESS_DRAW" && (gameState.pendingProgressDraw?.remaining ?? []).includes(pid)}
    <button
      class="action-btn"
      onclick={() =>
        send({
          type: "DRAW_PROGRESS",
          pid,
          track: gameState.pendingProgressDraw!.track,
        })}
    >
      🃏 Draw Progress Card
    </button>
  {:else if gameState.phase === "KNIGHT_DISPLACE_RESPONSE" && gameState.pendingDisplace?.displacedPlayerId === pid}
    <p class="action-instruction">
      👆 Click a yellow dot to move your displaced knight
    </p>
    {#if !canRelocateDisplaced}
      <button
        class="action-btn"
        onclick={() =>
          send({
            type: "DISPLACED_MOVE",
            pid,
            from: gameState.pendingDisplace!.displacedKnightVertex,
            to: null,
          })}
      >
        Return Knight to Supply
      </button>
    {/if}
  {:else if gameState.phase === "SCIENCE_SELECT_RESOURCE" && gameState.pendingScienceBonus?.pid === pid}
    <div class="science-bonus">
      <p class="action-instruction">🔬 Science level 3: take 1 free resource</p>
      <div class="science-picks">
        {#each scienceResources as key}
          <button
            class="card-pick-btn"
            onclick={() =>
              send({ type: "SELECT_SCIENCE_RESOURCE", pid, resource: key })}
          >
            {CARD_EMOJI[key]}
          </button>
        {/each}
      </div>
    </div>
  {:else if gameState.phase === "ROLL_DICE"}
    <button
      class="roll-dice-btn"
      onclick={() => send({ type: "ROLL_DICE", pid })}>🎲 Roll Dice</button
    >
  {:else if gameState.phase === "ROBBER_MOVE"}
    <button class="action-btn active" disabled
      >Click a hex to move robber…</button
    >
  {:else if gameState.phase === "ACTION" && tradeOfferForMe}
    <div class="trade-hint-panel">
      <p class="trade-hint-msg">
        🤝 You have an incoming trade offer!
      </p>
    </div>
  {:else if gameState.phase === "ACTION"}
    <div class="tab-bar">
      <button
        class="tab-btn"
        class:tab-active={activeTab === "build"}
        onclick={() => (activeTab = "build")}
      >Build <span
          class="tab-info"
          onclick={(e) => { e.stopPropagation(); showBuildInfo(); }}
          onkeydown={(e) => { if (e.key === "Enter") { e.stopPropagation(); showBuildInfo(); } }}
          role="button"
          tabindex="0"
          aria-label="Show build costs"
        >ⓘ</span></button
      >
      <button
        class="tab-btn"
        class:tab-active={activeTab === "knights"}
        onclick={() => (activeTab = "knights")}
      >Knights <span
          class="tab-info"
          onclick={(e) => { e.stopPropagation(); showKnightInfo(); }}
          onkeydown={(e) => { if (e.key === "Enter") { e.stopPropagation(); showKnightInfo(); } }}
          role="button"
          tabindex="0"
          aria-label="Show knight levels"
        >ⓘ</span></button
      >
      <button
        class="tab-btn"
        class:tab-active={activeTab === "improve"}
        onclick={() => (activeTab = "improve")}
      >Improve</button>
    </div>

    <div class="tab-content">
      {#if activeTab === "build"}
        <div class="group-btns">
          {#if pendingAction?.type === "build_road"}
            <button class="action-btn active" onclick={() => pending(null)}>Cancel Road</button>
          {:else}
            <button
              class="action-btn"
              class:disabled={!canRoad}
              aria-disabled={!canRoad}
              onclick={(e) =>
                canRoad
                  ? pending({ type: "build_road" })
                  : showUnavailablePopover(e, "🛣️ Build Road", BUILD_COSTS.road, roadReason())}
            >🛣️ Road</button>
          {/if}

          {#if pendingAction?.type === "build_settlement"}
            <button class="action-btn active" onclick={() => pending(null)}>Cancel Settlement</button>
          {:else}
            <button
              class="action-btn"
              class:disabled={!canSettle}
              aria-disabled={!canSettle}
              onclick={(e) =>
                canSettle
                  ? pending({ type: "build_settlement" })
                  : showUnavailablePopover(e, "🏠 Build Settlement", BUILD_COSTS.settlement, settlementReason())}
            >🏠 Settlement</button>
          {/if}

          {#if pendingAction?.type === "build_city"}
            <button class="action-btn active" onclick={() => pending(null)}>Cancel City</button>
          {:else}
            <button
              class="action-btn"
              class:disabled={!canCity}
              aria-disabled={!canCity}
              onclick={(e) =>
                canCity
                  ? pending({ type: "build_city" })
                  : showUnavailablePopover(e, "🏙️ Build City", BUILD_COSTS.city, cityReason())}
            >🏙️ City</button>
          {/if}

          {#if pendingAction?.type === "build_city_wall"}
            <button class="action-btn active" onclick={() => pending(null)}>Cancel Wall</button>
          {:else}
            <button
              class="action-btn"
              class:disabled={!canWall}
              aria-disabled={!canWall}
              onclick={(e) =>
                canWall
                  ? pending({ type: "build_city_wall" })
                  : showUnavailablePopover(e, "🏰 Build City Wall", BUILD_COSTS.cityWall, wallReason())}
            >🏰 Wall</button>
          {/if}
        </div>

      {:else if activeTab === "knights"}
        <div class="group-btns">
          {#if pendingAction?.type === "recruit_knight"}
            <button class="action-btn active" onclick={() => pending(null)}>Cancel Knight</button>
          {:else}
            <button
              class="action-btn"
              class:disabled={!canKnight}
              aria-disabled={!canKnight}
              onclick={(e) =>
                canKnight
                  ? pending({ type: "recruit_knight" })
                  : showUnavailablePopover(e, "⚔️ Recruit Knight", BUILD_COSTS.knightRecruit, recruitKnightReason())}
            >⚔️ Knight</button>
          {/if}

          {#if pendingAction?.type === "promote_knight"}
            <button class="action-btn active" onclick={() => pending(null)}>Cancel Promote</button>
          {:else}
            <button
              class="action-btn"
              class:disabled={!canPromote}
              aria-disabled={!canPromote}
              onclick={(e) =>
                canPromote
                  ? pending({ type: "promote_knight" })
                  : showUnavailablePopover(e, "⬆️ Promote Knight", BUILD_COSTS.knightPromote, promoteKnightReason())}
            >⬆️ Promote</button>
          {/if}

          {#if pendingAction?.type === "activate_knight"}
            <button class="action-btn active" onclick={() => pending(null)}>Cancel Activate</button>
          {:else}
            <button
              class="action-btn"
              class:disabled={!canActivate}
              aria-disabled={!canActivate}
              onclick={(e) =>
                canActivate
                  ? pending({ type: "activate_knight" })
                  : showUnavailablePopover(e, "🛡️ Activate Knight", BUILD_COSTS.knightActivate, activateKnightReason())}
            >🛡️ Activate</button>
          {/if}

          {#if pendingAction?.type === "move_knight_from" || pendingAction?.type === "move_knight_to"}
            <button class="action-btn active" onclick={() => pending(null)}>Cancel Move</button>
          {:else}
            <button
              class="action-btn"
              class:disabled={!canMove}
              aria-disabled={!canMove}
              onclick={(e) =>
                canMove
                  ? pending({ type: "move_knight_from" })
                  : showUnavailablePopover(e, "🚶 Move Knight", {}, moveKnightReason())}
            >🚶 Move</button>
          {/if}

          {#if pendingAction?.type === "displace_knight_from" || pendingAction?.type === "displace_knight_to"}
            <button class="action-btn active" onclick={() => pending(null)}>Cancel Displace</button>
          {:else}
            <button
              class="action-btn"
              class:disabled={!canDisplace}
              aria-disabled={!canDisplace}
              onclick={(e) =>
                canDisplace
                  ? pending({ type: "displace_knight_from" })
                  : showUnavailablePopover(e, "⚔️ Displace Knight", {}, displaceKnightReason())}
            >⚔️ Displace</button>
          {/if}

          {#if gameState.barbarian.robberActive}
            {#if pendingAction?.type === "chase_robber_from" || pendingAction?.type === "chase_robber_hex"}
              <button class="action-btn active" onclick={() => pending(null)}>Cancel Chase</button>
            {:else}
              <button
                class="action-btn"
                class:disabled={!canChaseRobberNow}
                aria-disabled={!canChaseRobberNow}
                onclick={(e) =>
                  canChaseRobberNow
                    ? pending({ type: "chase_robber_from" })
                    : showUnavailablePopover(e, "🏃 Chase Robber", {}, chaseRobberReason())}
              >🏃 Chase Robber</button>
            {/if}
          {/if}
        </div>

      {:else}
        <div class="improve-tracks">
          {#each tracks as track}
            {@const level = me.improvements[track]}
            {@const color = trackLabel[track].color}
            {@const metroOwner = gameState.metropolisOwner[track]}
            {@const canImprove = canImproveCity(board, me, track, craneDiscount, gameState.metropolisOwner)}
            {@const metroOwnerLevel = metroOwner !== null && metroOwner !== pid
              ? gameState.players[metroOwner].improvements[track]
              : 0}
            {@const metroIndicatorPip = metroPipIndex(metroOwner, pid, level, metroOwnerLevel)}
            <div class="track-row">
              <div class="track-head">
                <span class="track-label" style="color:{color}">{trackLabel[track].label}</span>
                <div class="track-bar">
                  {#each [0, 1, 2, 3, 4] as i}
                    {#if i === 2}
                      <button
                        class="pip pip-ability"
                        class:pip-filled={level > 2}
                        class:pip-metro-indicator={metroIndicatorPip === 2}
                        style="--c:{color}"
                        onclick={() => store.openInfoModal({ kind: "city-improvement-ability", track })}
                        title="{trackLabel[track].label} ability"
                      ></button>
                    {:else}
                      <div
                        class="pip"
                        class:pip-filled={i < level}
                        class:pip-metro={i === 3 || i === 4}
                        class:pip-metro-owned={i >= 3 && metroOwner === pid}
                        class:pip-metro-indicator={i === metroIndicatorPip}
                        style="--c:{color}"
                        title={i >= 3 ? `Lv${i + 1}: metropolis opportunity` : undefined}
                      ></div>
                    {/if}
                  {/each}
                  <span class="lv-num">Lv{level}</span>
                </div>
                <button
                  class="improve-btn"
                  class:disabled={!canImprove}
                  aria-disabled={!canImprove}
                  style={canImprove ? `color:${color};border-color:${color};background:${color}18` : undefined}
                  onclick={(e) =>
                    canImprove
                      ? send({ type: "IMPROVE_CITY", pid, track })
                      : showUnavailablePopover(e, trackLabel[track].label, improveCost(track), improveReason(track))}
                >+</button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="group-btns bottom-bar">
      <button class="action-btn" onclick={() => (showTrade = true)}>🏦 Bank</button>
      <button class="action-btn" onclick={() => (showPlayerTrade = true)}>🤝 Trade</button>
      <button
        class="action-btn end-turn"
        onclick={() => send({ type: "END_TURN", pid })}>✓ End Turn</button>
    </div>
  {/if}
</div>

<CatanPopover
  open={!!popover}
  x={popover?.x ?? 0}
  y={popover?.y ?? 0}
  ariaLabel="Close unavailable action details"
  onClose={closeUnavailablePopover}
>
  {#if popover}
    <div class="unavailable-popover">
      <div class="unavailable-title">{popover.title}</div>
      {#if Object.keys(popover.cost).length > 0}
        <div class="cost-chips">
          {#each Object.entries(popover.cost) as [k, v]}
            {@const key = k as keyof Resources}
            {@const have = me.resources[key] ?? 0}
            <span
              class="cost-chip"
              class:lacking={have < (v ?? 0)}
              style={`background:${RESOURCE_COLORS[key]}`}
            >
              {CARD_EMOJI[key]}x{v}
              <span class="have-count">({have})</span>
            </span>
          {/each}
        </div>
      {/if}
      {#if popover.reason}
        <p class="reason-text">{popover.reason}</p>
      {/if}
    </div>
  {/if}
</CatanPopover>

<style>
  .action-panel {
    padding: 0.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  /* ── tabs ── */
  .tab-bar {
    display: flex;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .tab-btn {
    flex: 1;
    padding: 6px 0;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: #7a9a7a;
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    font: inherit;
    transition: color 0.15s, border-color 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }
  .tab-btn:hover {
    color: #b0c8b0;
  }
  .tab-btn.tab-active {
    color: #c8b47a;
    font-weight: 700;
    border-bottom-color: #c8b47a;
  }
  .tab-info {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.35);
    cursor: pointer;
    line-height: 1;
  }
  .tab-info:hover {
    color: rgba(255, 255, 255, 0.7);
  }
  .tab-content {
    padding: 0.4rem 0.4rem 0.2rem;
    min-height: 82px;
  }
  /* ── improve tab ── */
  .improve-tracks {
    display: flex;
    flex-direction: column;
  }
  .track-row {
    padding: 5px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .track-row:last-child {
    border-bottom: none;
  }
  .track-head {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .track-label {
    font-size: 12px;
    font-weight: 600;
    flex-shrink: 0;
    width: 74px;
  }
  .track-bar {
    display: flex;
    gap: 2px;
    align-items: center;
    flex: 1;
  }
  .pip {
    width: 18px;
    height: 9px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.08);
    transition: background 0.25s, border-color 0.25s, box-shadow 0.25s;
  }
  .pip.pip-filled {
    background: var(--c);
  }
  .pip.pip-ability {
    height: 13px;
    border: 1.5px dashed rgba(255, 215, 0, 0.45);
    background: rgba(255, 215, 0, 0.05);
    cursor: pointer;
    padding: 0;
  }
  .pip.pip-ability:hover {
    filter: brightness(1.2);
  }
  .pip.pip-ability.pip-filled {
    background: var(--c);
    border: 1.5px solid rgba(255, 255, 255, 0.75);
    box-shadow: 0 0 5px rgba(255, 215, 0, 0.35);
  }
  .pip.pip-metro {
    height: 13px;
    border: 1.5px dashed rgba(255, 185, 0, 0.35);
    background: rgba(255, 185, 0, 0.04);
  }
  .pip.pip-metro.pip-filled {
    background: var(--c);
    border: 1.5px solid rgba(255, 255, 255, 0.75);
    box-shadow: 0 0 6px rgba(255, 215, 0, 0.4);
  }
  .pip.pip-metro-owned.pip-filled {
    border-color: rgba(255, 255, 255, 0.95);
    box-shadow: 0 0 8px rgba(255, 215, 0, 0.65), 0 0 2px rgba(255, 215, 0, 0.9);
  }
  .pip.pip-metro-indicator {
    position: relative;
  }
  .pip.pip-metro-indicator::after {
    content: "♛";
    position: absolute;
    font-size: 7px;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: rgba(255, 255, 255, 0.9);
    line-height: 1;
    pointer-events: none;
  }
  .lv-num {
    font-size: 10px;
    color: #6a8a6a;
    margin-left: 3px;
    flex-shrink: 0;
  }
  .improve-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: 1.5px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    font-size: 16px;
    font-weight: 700;
    line-height: 1;
    color: rgba(255, 255, 255, 0.25);
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.12s, transform 0.1s, border-color 0.12s;
  }
  .improve-btn:hover:not(.disabled) {
    background: rgba(255, 255, 255, 0.1);
    transform: scale(1.08);
  }
  .improve-btn.disabled {
    cursor: default;
  }
  .bottom-bar {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 0.35rem;
    margin-top: 0;
  }

  .action-group {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .group-label {
    font-size: 0.6rem;
    text-transform: uppercase;
    color: #a0b0a0;
    letter-spacing: 0.08em;
  }
  .group-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .info-btn {
    border: 1px solid rgba(255, 255, 255, 0.28);
    background: rgba(255, 255, 255, 0.12);
    color: #f0e8d0;
    border-radius: 999px;
    width: 1.35rem;
    height: 1.35rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;
  }
  .group-btns {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .end-turn {
    flex: 1;
  }
  .action-btn {
    background: rgba(255, 255, 255, 0.1);
    color: #f0e8d0;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 5px;
    padding: 0.34rem 0.62rem;
    font-size: 0.78rem;
    cursor: pointer;
    transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
  }
  .action-btn:hover:not(:disabled):not(.disabled) {
    background: rgba(255, 255, 255, 0.18);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  }
  .action-btn:active:not(:disabled):not(.disabled) {
    transform: translateY(0) scale(0.97);
    box-shadow: none;
  }
  .action-btn.active {
    background: #3a5e1e;
    border-color: #6dbf6d;
    color: #f5c842;
  }
  .action-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .action-btn.disabled {
    opacity: 0.4;
  }
  .roll-dice-btn {
    width: 100%;
    padding: 0.9rem;
    font-size: 1.2rem;
    font-weight: 700;
    background: #3a5e1e;
    border: 2px solid #6dbf6d;
    border-radius: 8px;
    color: #f5c842;
    cursor: pointer;
    transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
    animation: dice-pulse 2s ease-in-out infinite;
  }
  .roll-dice-btn:hover {
    background: #4a7a28;
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(107, 191, 109, 0.3);
  }
  .roll-dice-btn:active {
    transform: translateY(0) scale(0.97);
    box-shadow: none;
    animation: none;
  }
  @keyframes dice-pulse {
    0%, 100% {
      box-shadow: 0 0 12px rgba(107, 191, 109, 0.35), 0 0 0 0 rgba(107, 191, 109, 0.4);
    }
    50% {
      box-shadow: 0 0 28px rgba(107, 191, 109, 0.6), 0 0 0 6px rgba(107, 191, 109, 0);
    }
  }
  .action-instruction {
    padding: 0.4rem;
    font-size: 0.76rem;
    color: #f5c842;
    line-height: 1.4;
  }

  .science-bonus {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0;
  }

  .science-picks {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    justify-content: center;
  }

  .card-pick-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    padding: 0.4rem 0.55rem;
    font-size: 1.1rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .card-pick-btn:hover {
    background: rgba(255, 255, 255, 0.18);
    border-color: #2e9e4f;
  }
  .unavailable-popover {
    min-width: 165px;
    max-width: 230px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 8px;
    background: #1a2a1a;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.65);
    padding: 0.48rem 0.55rem;
  }
  .unavailable-title {
    margin-bottom: 0.33rem;
    font-size: 0.75rem;
    font-weight: 700;
    color: #f5c842;
  }
  .cost-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .cost-chip {
    border-radius: 4px;
    border: 2px solid transparent;
    padding: 0.12rem 0.38rem;
    font-size: 0.74rem;
    font-weight: 700;
    color: #132413;
    display: inline-flex;
    align-items: center;
    gap: 0.16rem;
  }
  .cost-chip.lacking {
    border-color: #f87171;
  }
  .have-count {
    font-size: 0.65rem;
    opacity: 0.78;
  }
  .reason-text {
    margin: 0.35rem 0 0;
    font-size: 0.72rem;
    color: #efb4ad;
    line-height: 1.3;
  }

  .end-turn {
    background: #8b6914;
    border-color: #c8a02e;
    font-weight: 700;
  }

  @media (prefers-reduced-motion: reduce) {
    .action-btn, .roll-dice-btn { transition: none; animation: none; }
    .action-btn:hover:not(:disabled):not(.disabled),
    .roll-dice-btn:hover { transform: none; box-shadow: none; }
  }

  .trade-hint-panel {
    padding: 0.6rem 0.5rem;
    text-align: center;
  }

  .trade-hint-msg {
    margin: 0;
    font-size: 0.85rem;
    color: #c8b47a;
  }
</style>
