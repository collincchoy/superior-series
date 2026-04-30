<script lang="ts">
  import {
    BASIC_RESOURCE_KEYS,
    type GameAction,
    type GameState,
    type ImprovementTrack,
    type PlayerId,
    type Resources,
    type VertexId,
  } from "../../lib/catan/types.js";
  import type { PendingAction } from "../../lib/catan/validTargets.js";
  import { compactActionLeftTab } from "../../lib/catan/pendingActionUi.js";
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
    canMoveKnight,
    canChaseRobber,
    playerHasCity,
    improvementWouldClaimMetropolis,
  } from "../../lib/catan/rules.js";
  import { buildGraph } from "../../lib/catan/board.js";
  import { TRACK_COMMODITY, BUILD_COSTS } from "../../lib/catan/constants.js";
  import CatanPopover from "./CatanPopover.svelte";
  import ResourceKeyTapRow from "./ResourceKeyTapRow.svelte";
  import BoardPieceStack from "./BoardPieceStack.svelte";

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

  /** Single derived phase for the template ladder — avoids stale {:else if} arms vs PhaseBanner. */
  let phase = $derived(gameState.phase);

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
  let hasKnightAdvanceTarget = $derived(
    Object.entries(board.knights).some(([fromVid, k]) => {
      if (
        !k ||
        k.playerId !== pid ||
        !k.active ||
        activatedThisTurn.has(fromVid as VertexId)
      )
        return false;
      const fv = fromVid as VertexId;
      return (
        Object.keys(graph.vertices).some((toVid) =>
          canMoveKnight(board, graph, pid, fv, toVid as VertexId),
        ) ||
        Object.entries(board.knights).some(
          ([tv, tk]) =>
            tk !== null &&
            tk.playerId !== pid &&
            canDisplaceKnight(board, graph, pid, fv, tv as VertexId),
        )
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

  let buildTabPlayable = $derived(canRoad || canSettle || canCity || canWall);
  let canDeployKnight = $derived(canKnight || canPromote);
  let knightsTabPlayable = $derived(
    canDeployKnight ||
      canActivate ||
      hasKnightAdvanceTarget ||
      canChaseRobberNow,
  );

  let knightSupplyTitle = $derived(
    `Knights — basic ${me.supply.knights[1]}, strong ${me.supply.knights[2]}, mighty ${me.supply.knights[3]}`,
  );
  let knightSupplyAriaLabel = $derived(
    `Place or upgrade a knight on the board. Supply: ${me.supply.knights[1]} basic, ${me.supply.knights[2]} strong, ${me.supply.knights[3]} mighty.`,
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
    /** Trigger element rect (viewport) for popover flip/clamp. */
    anchor: { top: number; left: number; right: number; bottom: number };
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
    popover = {
      x,
      y: rect.bottom + 6,
      anchor: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom },
      title,
      cost,
      reason,
    };
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
  function knightDeployUnavailable(event: MouseEvent) {
    const bits: string[] = [];
    const rr = recruitKnightReason();
    const pr = promoteKnightReason();
    if (rr) bits.push(rr);
    if (pr) bits.push(pr);
    showUnavailablePopover(
      event,
      "⚔️ Knight (recruit or upgrade)",
      {},
      [...new Set(bits)].join("\n\n") || undefined,
    );
  }
  function advanceKnightUnavailable(event: MouseEvent) {
    const mr = moveKnightReason();
    const dr = displaceKnightReason();
    const bits = [mr, dr].filter(Boolean);
    showUnavailablePopover(
      event,
      "🚶 Advance knight",
      {},
      bits.join("\n\n") || undefined,
    );
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

  function metropolisOwnerLevel(track: ImprovementTrack): number {
    const owner = gameState.metropolisOwner[track];
    return owner ? (gameState.players[owner]?.improvements[track] ?? 0) : 0;
  }

  let improveRowPlayable = $derived(
    tracks.some((track) =>
      canImproveCity(
        board,
        me,
        track,
        craneDiscount,
        gameState.metropolisOwner,
        metropolisOwnerLevel(track),
      ),
    ),
  );

  function improveReason(track: ImprovementTrack): string | undefined {
    if (!hasCity) return "Requires at least one city on the board.";
    if (me.improvements[track] >= 5) return "Already at maximum level.";
    const targetLevel = me.improvements[track] + 1;
    if (
      improvementWouldClaimMetropolis(
        pid,
        track,
        targetLevel,
        gameState.metropolisOwner,
        metropolisOwnerLevel(track),
      ) &&
      !Object.values(board.vertices).some(
        (v) => v?.type === "city" && v.playerId === pid && v.metropolis === null,
      )
    ) {
      return "Build a city first — all your cities already hold a metropolis.";
    }
  }

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

  const ACTION_LEFT_TAB_DEFS = [
    { id: "build" as const, label: "Build", infoAria: "Show build costs" },
    { id: "knights" as const, label: "Knights", infoAria: "Knight levels" },
  ] as const;

  let isActionTabsSlice = $derived(
    phase === "ACTION" && !tradeOfferForMe && gameState.currentPlayerId === pid,
  );
  let prevIsActionTabsSlice = $state(false);

  let activeLeftTab = $state<"build" | "knights">("build");

  $effect(() => {
    if (pendingAction) {
      const tab = compactActionLeftTab(pendingAction);
      if (tab) activeLeftTab = tab;
      prevIsActionTabsSlice = isActionTabsSlice;
      return;
    }

    const enteredSlice = isActionTabsSlice && !prevIsActionTabsSlice;
    prevIsActionTabsSlice = isActionTabsSlice;

    if (!enteredSlice) return;

    const leftOk =
      activeLeftTab === "build" ? buildTabPlayable : knightsTabPlayable;
    const anyLeftPlayable = buildTabPlayable || knightsTabPlayable;
    if (leftOk || !anyLeftPlayable) return;

    if (buildTabPlayable) activeLeftTab = "build";
    else activeLeftTab = "knights";
  });
</script>

<div class="action-panel">
  {#if phase === "SETUP_R1_SETTLEMENT"}
    <p class="action-instruction">
      👆 Click a yellow dot on the board to place your settlement
    </p>
  {:else if phase === "SETUP_R1_ROAD"}
    <p class="action-instruction">
      👆 Click a yellow line on the board to place your road
    </p>
  {:else if phase === "SETUP_R2_CITY"}
    <p class="action-instruction">
      👆 Click a yellow dot on the board to place your city
    </p>
  {:else if phase === "SETUP_R2_ROAD"}
    <p class="action-instruction">
      👆 Click a yellow line on the board to place your road
    </p>
  {:else if phase === "DISCARD_PROGRESS" && (gameState.pendingProgressDiscard?.remaining[pid] ?? 0) > 0}
    <p class="action-instruction">
      Preview a card, discard it, then repeat if you still owe discards.
    </p>
  {:else if phase === "RESOLVE_PROGRESS_DRAW" && (gameState.pendingProgressDraw?.remaining ?? []).includes(pid)}
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
  {:else if phase === "KNIGHT_DISPLACE_RESPONSE" && gameState.pendingDisplace?.displacedPlayerId === pid}
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
  {:else if phase === "SCIENCE_SELECT_RESOURCE" && gameState.pendingScienceBonus?.pid === pid}
    <div class="science-bonus">
      <p class="action-instruction">🔬 Science level 3: take 1 free resource</p>
      <div class="science-picks">
        <ResourceKeyTapRow
          keys={[...BASIC_RESOURCE_KEYS]}
          onTap={(key) =>
            send({ type: "SELECT_SCIENCE_RESOURCE", pid, resource: key })}
        />
      </div>
    </div>
  {:else if phase === "ROLL_DICE"}
    <button
      type="button"
      class="roll-dice-btn"
      onclick={() => send({ type: "ROLL_DICE", pid })}
    >
      🎲 Roll Dice
    </button>
  {:else if phase === "ROBBER_MOVE"}
    <button type="button" class="action-btn active" disabled>
      Click a hex to move robber…
    </button>
  {:else if phase === "ACTION" && tradeOfferForMe}
    <div class="trade-hint-panel">
      <p class="trade-hint-msg">
        🤝 You have an incoming trade offer!
      </p>
    </div>
  {:else if phase === "ACTION"}
    {#snippet improveTracksSnippet()}
      <div class="improve-tracks improve-tracks-compact">
        {#each tracks as track}
          {@const level = me.improvements[track]}
          {@const color = trackLabel[track].color}
          {@const metroOwner = gameState.metropolisOwner[track]}
          {@const metroOwnerLevel = metropolisOwnerLevel(track)}
          {@const canImprove = canImproveCity(
            board,
            me,
            track,
            craneDiscount,
            gameState.metropolisOwner,
            metroOwnerLevel,
          )}
          {@const metroIndicatorPip = metroPipIndex(metroOwner, pid, level, metroOwnerLevel)}
          <div class="track-row">
            <div class="track-head">
              <span class="track-label" style="color:{color}">{trackLabel[track].label}</span>
              <div class="track-bar">
                {#each [0, 1, 2, 3, 4] as i}
                  {#if i === 2}
                    <button
                      type="button"
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
                type="button"
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
    {/snippet}

    {#snippet knightDeployStacks()}
      <div class="knight-deploy-piles">
        {#each ([1, 2, 3] as const) as tier (tier)}
          <BoardPieceStack
            piece="knight"
            count={me.supply.knights[tier]}
            playerColor={me.color}
            knightStrength={tier}
            maxVisibleLayers={3}
            compact
          />
        {/each}
      </div>
    {/snippet}

    <div class="action-compact-grid">
      <div class="action-col-actions">
        <div class="tab-bar action-actions-tab-bar" role="tablist" aria-label="Build or knight actions">
          {#each ACTION_LEFT_TAB_DEFS as tab (tab.id)}
            {@const playable = tab.id === "build" ? buildTabPlayable : knightsTabPlayable}
            {@const openInfo = tab.id === "build" ? showBuildInfo : showKnightInfo}
            {@const hintAway =
              playable && activeLeftTab !== tab.id ? `${tab.label} — actions available on this tab` : undefined}
            <button
              type="button"
              class="tab-btn"
              class:tab-active={activeLeftTab === tab.id}
              role="tab"
              aria-selected={activeLeftTab === tab.id}
              title={hintAway}
              onclick={() => (activeLeftTab = tab.id)}
            >
              {#if playable && activeLeftTab !== tab.id}
                <span class="tab-playable-dot" aria-hidden="true"></span>
              {/if}
              {tab.label}
              <span
                class="tab-info"
                onclick={(e) => {
                  e.stopPropagation();
                  openInfo();
                }}
                onkeydown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    openInfo();
                  }
                }}
                role="button"
                tabindex="0"
                aria-label={tab.infoAria}
              >ⓘ</span>
            </button>
          {/each}
        </div>
        <div class="tab-panels-slot action-actions-tab-panel" role="tabpanel">
        <div
          class="tab-pane tab-pane-stack"
          class:tab-pane-active={activeLeftTab === "build"}
          aria-hidden={activeLeftTab !== "build"}
          inert={activeLeftTab !== "build"}
        >
        <div class="group-btns group-piece-row piece-grid-tight">
              {#if pendingAction?.type === "build_road"}
                <button
                  type="button"
                  class="action-btn action-piece action-piece-with-stack active"
                  aria-label="Cancel road placement"
                  onclick={() => pending(null)}
                >
                  <span class="piece-stack-cancel-x" aria-hidden="true">×</span>
                  <BoardPieceStack piece="road" count={me.supply.roads} playerColor={me.color} />
                </button>
              {:else}
                <button
                  type="button"
                  class="action-btn action-piece action-piece-with-stack"
                  class:disabled={!canRoad}
                  aria-disabled={!canRoad}
                  aria-label={`Build road — ${me.supply.roads} remaining in supply`}
                  title={`Road (${me.supply.roads} in supply)`}
                  onclick={(e) =>
                    canRoad
                      ? pending({ type: "build_road" })
                      : showUnavailablePopover(e, "🛣️ Build Road", BUILD_COSTS.road, roadReason())}
                >
                  <BoardPieceStack piece="road" count={me.supply.roads} playerColor={me.color} />
                </button>
              {/if}

              {#if pendingAction?.type === "build_settlement"}
                <button
                  type="button"
                  class="action-btn action-piece action-piece-with-stack active"
                  aria-label="Cancel settlement placement"
                  onclick={() => pending(null)}
                >
                  <span class="piece-stack-cancel-x" aria-hidden="true">×</span>
                  <BoardPieceStack piece="settlement" count={me.supply.settlements} playerColor={me.color} />
                </button>
              {:else}
                <button
                  type="button"
                  class="action-btn action-piece action-piece-with-stack"
                  class:disabled={!canSettle}
                  aria-disabled={!canSettle}
                  aria-label={`Build settlement — ${me.supply.settlements} remaining`}
                  title={`Settlement (${me.supply.settlements} in supply)`}
                  onclick={(e) =>
                    canSettle
                      ? pending({ type: "build_settlement" })
                      : showUnavailablePopover(e, "🏠 Build Settlement", BUILD_COSTS.settlement, settlementReason())}
                >
                  <BoardPieceStack piece="settlement" count={me.supply.settlements} playerColor={me.color} />
                </button>
              {/if}

              {#if pendingAction?.type === "build_city"}
                <button
                  type="button"
                  class="action-btn action-piece action-piece-with-stack active"
                  aria-label="Cancel city placement"
                  onclick={() => pending(null)}
                >
                  <span class="piece-stack-cancel-x" aria-hidden="true">×</span>
                  <BoardPieceStack piece="city" count={me.supply.cities} playerColor={me.color} />
                </button>
              {:else}
                <button
                  type="button"
                  class="action-btn action-piece action-piece-with-stack"
                  class:disabled={!canCity}
                  aria-disabled={!canCity}
                  aria-label={`Upgrade to city — ${me.supply.cities} cities left in supply`}
                  title={`City (${me.supply.cities} in supply)`}
                  onclick={(e) =>
                    canCity
                      ? pending({ type: "build_city" })
                      : showUnavailablePopover(e, "🏙️ Build City", BUILD_COSTS.city, cityReason())}
                >
                  <BoardPieceStack piece="city" count={me.supply.cities} playerColor={me.color} />
                </button>
              {/if}

              {#if pendingAction?.type === "build_city_wall"}
                <button
                  type="button"
                  class="action-btn action-piece action-piece-with-stack active"
                  aria-label="Cancel city wall placement"
                  onclick={() => pending(null)}
                >
                  <span class="piece-stack-cancel-x" aria-hidden="true">×</span>
                  <BoardPieceStack piece="cityWall" count={me.supply.cityWalls} playerColor={me.color} />
                </button>
              {:else}
                <button
                  type="button"
                  class="action-btn action-piece action-piece-with-stack"
                  class:disabled={!canWall}
                  aria-disabled={!canWall}
                  aria-label={`Build city wall — ${me.supply.cityWalls} remaining`}
                  title={`Wall (${me.supply.cityWalls} in supply)`}
                  onclick={(e) =>
                    canWall
                      ? pending({ type: "build_city_wall" })
                      : showUnavailablePopover(e, "🏰 Build City Wall", BUILD_COSTS.cityWall, wallReason())}
                >
                  <BoardPieceStack piece="cityWall" count={me.supply.cityWalls} playerColor={me.color} />
                </button>
              {/if}
            </div>
        </div>
        <div
          class="tab-pane tab-pane-stack"
          class:tab-pane-active={activeLeftTab === "knights"}
          aria-hidden={activeLeftTab !== "knights"}
          inert={activeLeftTab !== "knights"}
        >
        <div class="group-btns group-piece-row piece-grid-tight">
              {#if pendingAction?.type === "knight_deploy"}
                <button
                  type="button"
                  class="action-btn action-piece action-piece-with-stack action-piece-knight-deploy active"
                  aria-label="Cancel knight placement"
                  onclick={() => pending(null)}
                >
                  <span class="piece-stack-cancel-x" aria-hidden="true">×</span>
                  {@render knightDeployStacks()}
                </button>
              {:else}
                <button
                  type="button"
                  class="action-btn action-piece action-piece-with-stack action-piece-knight-deploy"
                  class:disabled={!canDeployKnight}
                  aria-disabled={!canDeployKnight}
                  aria-label={knightSupplyAriaLabel}
                  title={knightSupplyTitle}
                  onclick={(e) =>
                    canDeployKnight
                      ? pending({ type: "knight_deploy" })
                      : knightDeployUnavailable(e)}
                >
                  {@render knightDeployStacks()}
                </button>
              {/if}

              {#if pendingAction?.type === "activate_knight"}
                <button type="button" class="action-btn action-piece active" onclick={() => pending(null)}>✕ Activ.</button>
              {:else}
                <button
                  type="button"
                  class="action-btn action-piece"
                  class:disabled={!canActivate}
                  aria-disabled={!canActivate}
                  title="Activate knight"
                  onclick={(e) =>
                    canActivate
                      ? pending({ type: "activate_knight" })
                      : showUnavailablePopover(e, "🛡️ Activate Knight", BUILD_COSTS.knightActivate, activateKnightReason())}
                ><span class="ap-emoji">🛡️</span><span class="ap-lbl">Activ.</span></button>
              {/if}

              {#if pendingAction?.type === "advance_knight_from" || pendingAction?.type === "advance_knight_to"}
                <button type="button" class="action-btn action-piece active" onclick={() => pending(null)}>✕ Move</button>
              {:else}
                <button
                  type="button"
                  class="action-btn action-piece"
                  class:disabled={!hasKnightAdvanceTarget}
                  aria-disabled={!hasKnightAdvanceTarget}
                  title="Move to an empty junction or bump a weaker knight"
                  onclick={(e) =>
                    hasKnightAdvanceTarget
                      ? pending({ type: "advance_knight_from" })
                      : advanceKnightUnavailable(e)}
                ><span class="ap-emoji">🚶</span><span class="ap-lbl">Adv.</span></button>
              {/if}

              {#if gameState.barbarian.robberActive}
                {#if pendingAction?.type === "chase_robber_from" || pendingAction?.type === "chase_robber_hex"}
                  <button type="button" class="action-btn action-piece chase-chip active" onclick={() => pending(null)}>✕ Chase</button>
                {:else}
                  <button
                    type="button"
                    class="action-btn action-piece chase-chip"
                    class:disabled={!canChaseRobberNow}
                    aria-disabled={!canChaseRobberNow}
                    title="Move the robber with a knight beside it"
                    onclick={(e) =>
                      canChaseRobberNow
                        ? pending({ type: "chase_robber_from" })
                        : showUnavailablePopover(e, "🏃 Chase Robber", {}, chaseRobberReason())}
                  ><span class="ap-emoji">🏃</span><span class="ap-lbl">Chase</span></button>
                {/if}
              {/if}
            </div>
        </div>
        </div>
      </div>

      <div class="action-col-improve compact-block compact-block-improve">
        <div class="compact-block-head">
          {#if improveRowPlayable}
            <span class="playable-pip" title="An improvement is available" aria-hidden="true"></span>
          {/if}
          <span class="compact-block-title">Improve</span>
        </div>
        {@render improveTracksSnippet()}
      </div>
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
  anchor={popover?.anchor}
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
    padding: 0.35rem 0.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.28rem;
  }
  /* ACTION: side rail (viewport > --catan-compact-max) stacks vertically; compact widths use a 2-col grid */
  .action-compact-grid {
    display: flex;
    flex-direction: column;
    gap: 0.32rem;
    width: 100%;
  }
  .action-col-actions {
    display: flex;
    flex-direction: column;
    gap: 0.28rem;
    min-width: 0;
  }
  .action-col-improve {
    min-width: 0;
  }
  /* Build / Knights tabs (left column); Improve stays separate */
  .tab-bar {
    display: flex;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .action-actions-tab-bar .tab-btn {
    padding: 5px 2px;
    font-size: 0.58rem;
    letter-spacing: 0.06em;
    gap: 3px;
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
  .tab-playable-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #d4a853;
    flex-shrink: 0;
    box-shadow: 0 0 5px rgba(212, 168, 83, 0.55);
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
  .tab-panels-slot.action-actions-tab-panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto;
    padding-top: 0.12rem;
    min-width: 0;
  }
  .tab-pane.tab-pane-stack {
    grid-row: 1;
    grid-column: 1;
    min-width: 0;
  }
  .tab-pane.tab-pane-stack:not(.tab-pane-active) {
    visibility: hidden;
    pointer-events: none;
  }
  .compact-block {
    width: 100%;
  }
  .compact-block + .compact-block {
    padding-top: 0.28rem;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
  }
  .compact-block-head {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 0.2rem;
  }
  .compact-block-title {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #93ab93;
  }
  .playable-pip {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #d4a853;
    flex-shrink: 0;
    box-shadow: 0 0 4px rgba(212, 168, 83, 0.5);
  }
  .compact-infotip {
    margin-left: auto;
    padding: 0;
    border: none;
    background: transparent;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.35);
    cursor: pointer;
    line-height: 1;
  }
  .compact-infotip:hover {
    color: rgba(255, 255, 255, 0.75);
  }
  .compact-block-improve .compact-block-head {
    margin-bottom: 0.12rem;
  }
  @media (max-width: var(--catan-compact-max)) {
    .action-compact-grid {
      display: grid;
      /* Actions yield first; Improve gets a slightly larger fraction above its 52% floor */
      grid-template-columns: minmax(0, 0.9fr) minmax(52%, 1.1fr);
      gap: 0.28rem 0.42rem;
      align-items: start;
    }
    .action-col-improve {
      border-left: 1px solid rgba(255, 255, 255, 0.08);
      padding-left: 0.38rem;
      /* Fallback only if intrinsic mins exceed column width after flex-grow */
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-x: contain;
    }
    .action-col-improve .improve-tracks-compact {
      width: 100%;
      min-width: 0;
    }
    .action-col-improve .improve-tracks-compact .track-head {
      min-width: 0;
    }
    .action-col-improve .improve-tracks-compact .track-bar {
      flex: 1 1 0;
      min-width: 0;
      gap: 2px;
    }
    .action-col-improve .improve-tracks-compact .pip {
      flex: 1 1 0;
      min-width: 11px;
      width: auto;
      box-sizing: border-box;
    }
    .action-col-improve .improve-tracks-compact .pip.pip-ability,
    .action-col-improve .improve-tracks-compact .pip.pip-metro {
      min-width: 12px;
    }
    .action-col-improve .improve-tracks-compact .lv-num {
      flex-shrink: 0;
    }
    .action-col-improve .improve-tracks-compact .track-label {
      flex-shrink: 0;
    }
    .action-col-improve .improve-tracks-compact .improve-btn {
      flex-shrink: 0;
    }
    .group-piece-row.piece-grid-tight {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.16rem;
    }
    .group-piece-row.piece-grid-tight .chase-chip {
      grid-column: 1 / -1;
    }
  }
  .group-piece-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.22rem;
  }
  .action-piece {
    display: inline-flex !important;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.03rem;
    /* ~44px min touch target (width + height); can grow with grid cells */
    min-width: max(44px, 2.75rem);
    min-height: max(44px, 2.75rem);
    box-sizing: border-box;
    padding: 0.16rem 0.26rem !important;
    font-size: 0.54rem !important;
    font-weight: 600;
    line-height: 1;
  }
  .action-piece.chase-chip {
    min-width: max(44px, 3.35rem);
    flex-direction: row;
    gap: 0.25rem;
  }
  .action-piece-with-stack {
    position: relative;
    overflow: hidden;
    padding-top: 0.22rem !important;
    padding-bottom: 0.1rem !important;
    gap: 0 !important;
  }
  .piece-stack-cancel-x {
    position: absolute;
    top: 2px;
    right: 6px;
    z-index: 60;
    font-size: 1.05rem;
    line-height: 1;
    font-weight: 800;
    color: #fdfaf0;
    text-shadow: 0 0 4px rgba(0, 0, 0, 0.85), 0 1px 2px #000;
    pointer-events: none;
  }
  .knight-deploy-piles {
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    justify-content: center;
    gap: 2px;
    width: 100%;
    flex: 1;
    min-width: 0;
    pointer-events: none;
  }
  .action-piece-knight-deploy {
    min-width: max(44px, 100%);
    grid-column: 1 / -1;
  }
  .knight-deploy-piles :global(.piece-stack-compact) {
    flex: 1;
    max-width: 3.1rem;
    min-width: 0;
  }
  .ap-emoji {
    font-size: 0.92rem;
    line-height: 1;
  }
  .ap-lbl {
    font-size: 0.49rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    opacity: 0.93;
    text-align: center;
  }
  .improve-tracks-compact .track-row {
    padding: 2px 0;
  }
  .improve-tracks-compact .track-head {
    gap: 4px;
  }
  .improve-tracks-compact .track-label {
    width: 56px;
    font-size: 10px;
  }
  .improve-tracks-compact .track-bar {
    flex: 1;
    min-width: 0;
    gap: 1px;
  }
  .improve-tracks-compact .pip {
    width: 13px;
    height: 7px;
    border-radius: 2px;
  }
  .improve-tracks-compact .pip.pip-ability {
    height: 11px;
  }
  .improve-tracks-compact .pip.pip-metro {
    height: 11px;
  }
  .improve-tracks-compact .lv-num {
    font-size: 9px;
    margin-left: 2px;
  }
  .improve-tracks-compact .improve-btn {
    width: 22px;
    height: 22px;
    font-size: 13px;
    border-radius: 5px;
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
