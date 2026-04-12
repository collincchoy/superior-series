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
    playerHasCity,
  } from "../../lib/catan/rules.js";
  import { buildGraph } from "../../lib/catan/board.js";
  import { TRACK_COMMODITY, BUILD_COSTS } from "../../lib/catan/constants.js";
  import CatanPopover from "./CatanPopover.svelte";
  let {
    gameState,
    localPid,
    pendingAction,
    showTrade = $bindable(false),
  }: {
    gameState: GameState;
    localPid: PlayerId;
    pendingAction: PendingAction | null;
    showTrade: boolean;
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
  {:else if gameState.phase === "ROLL_DICE"}
    <button
      class="roll-dice-btn"
      onclick={() => send({ type: "ROLL_DICE", pid })}>🎲 Roll Dice</button
    >
  {:else if gameState.phase === "ROBBER_MOVE"}
    <button class="action-btn active" disabled
      >Click a hex to move robber…</button
    >
  {:else if gameState.phase === "ACTION"}
    <div class="action-group">
      <div class="group-head">
        <span class="group-label">Build</span>
        <button class="info-btn" onclick={showBuildInfo} aria-label="Show build costs">i</button>
      </div>
      <div class="group-btns">
        {#if pendingAction?.type === "build_road"}
          <button class="action-btn active" onclick={() => pending(null)}
            >Cancel Road</button
          >
        {:else}
          <button
            class="action-btn"
            class:disabled={!canRoad}
            aria-disabled={!canRoad}
            onclick={(e) =>
              canRoad
                ? pending({ type: "build_road" })
                : showUnavailablePopover(
                    e,
                    "🛣️ Build Road",
                    BUILD_COSTS.road,
                    roadReason(),
                  )}
          >🛣️ Road</button
          >
        {/if}

        {#if pendingAction?.type === "build_settlement"}
          <button class="action-btn active" onclick={() => pending(null)}
            >Cancel Settlement</button
          >
        {:else}
          <button
            class="action-btn"
            class:disabled={!canSettle}
            aria-disabled={!canSettle}
            onclick={(e) =>
              canSettle
                ? pending({ type: "build_settlement" })
                : showUnavailablePopover(
                    e,
                    "🏠 Build Settlement",
                    BUILD_COSTS.settlement,
                    settlementReason(),
                  )}
          >🏠 Settlement</button
          >
        {/if}

        {#if pendingAction?.type === "build_city"}
          <button class="action-btn active" onclick={() => pending(null)}
            >Cancel City</button
          >
        {:else}
          <button
            class="action-btn"
            class:disabled={!canCity}
            aria-disabled={!canCity}
            onclick={(e) =>
              canCity
                ? pending({ type: "build_city" })
                : showUnavailablePopover(
                    e,
                    "🏙️ Build City",
                    BUILD_COSTS.city,
                    cityReason(),
                  )}
          >🏙️ City</button
          >
        {/if}

        {#if pendingAction?.type === "build_city_wall"}
          <button class="action-btn active" onclick={() => pending(null)}
            >Cancel Wall</button
          >
        {:else}
          <button
            class="action-btn"
            class:disabled={!canWall}
            aria-disabled={!canWall}
            onclick={(e) =>
              canWall
                ? pending({ type: "build_city_wall" })
                : showUnavailablePopover(
                    e,
                    "🏰 Build City Wall",
                    BUILD_COSTS.cityWall,
                    wallReason(),
                  )}
          >🏰 Wall</button
          >
        {/if}
      </div>
    </div>

    <div class="action-group">
      <div class="group-head">
        <span class="group-label">Knights</span>
        <button class="info-btn" onclick={showKnightInfo} aria-label="Show knight levels">i</button>
      </div>
      <div class="group-btns">
        {#if pendingAction?.type === "recruit_knight"}
          <button class="action-btn active" onclick={() => pending(null)}
            >Cancel Knight</button
          >
        {:else}
          <button
            class="action-btn"
            class:disabled={!canKnight}
            aria-disabled={!canKnight}
            onclick={(e) =>
              canKnight
                ? pending({ type: "recruit_knight" })
                : showUnavailablePopover(
                    e,
                    "⚔️ Recruit Knight",
                    BUILD_COSTS.knightRecruit,
                    recruitKnightReason(),
                  )}
          >⚔️ Knight</button
          >
        {/if}

        {#if pendingAction?.type === "promote_knight"}
          <button class="action-btn active" onclick={() => pending(null)}
            >Cancel Promote</button
          >
        {:else}
          <button
            class="action-btn"
            class:disabled={!canPromote}
            aria-disabled={!canPromote}
            onclick={(e) =>
              canPromote
                ? pending({ type: "promote_knight" })
                : showUnavailablePopover(
                    e,
                    "⬆️ Promote Knight",
                    BUILD_COSTS.knightPromote,
                    promoteKnightReason(),
                  )}
          >⬆️ Promote</button
          >
        {/if}

        {#if pendingAction?.type === "activate_knight"}
          <button class="action-btn active" onclick={() => pending(null)}
            >Cancel Activate</button
          >
        {:else}
          <button
            class="action-btn"
            class:disabled={!canActivate}
            aria-disabled={!canActivate}
            onclick={(e) =>
              canActivate
                ? pending({ type: "activate_knight" })
                : showUnavailablePopover(
                    e,
                    "🛡️ Activate Knight",
                    BUILD_COSTS.knightActivate,
                    activateKnightReason(),
                  )}
          >🛡️ Activate</button
          >
        {/if}
      </div>
    </div>

    <div class="action-group">
      <span class="group-label">Improve</span>
      <div class="group-btns">
        {#each tracks as track}
          <button
            class="action-btn"
            class:disabled={!canImproveCity(board, me, track, craneDiscount)}
            aria-disabled={!canImproveCity(board, me, track, craneDiscount)}
            onclick={(e) =>
              canImproveCity(board, me, track, craneDiscount)
                ? send({ type: "IMPROVE_CITY", pid, track })
                : showUnavailablePopover(
                    e,
                    trackLabel[track].label,
                    improveCost(track),
                    improveReason(track),
                  )}
            style={`background:${trackLabel[track].color};color:${track === "trade" ? "#3f2d00" : "#ffffff"};border-color:rgba(0,0,0,0.35);`}
          >
            {trackLabel[track].label}
          </button>
        {/each}
      </div>
    </div>

    <div class="group-btns">
      <button class="action-btn" onclick={() => (showTrade = true)}
        >🏦 Trade</button
      >
      <button
        class="action-btn end-turn"
        onclick={() => send({ type: "END_TURN", pid })}>✓ End Turn</button
      >
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
    0%, 100% { box-shadow: 0 0 0 0 rgba(107, 191, 109, 0.4); }
    50% { box-shadow: 0 0 0 6px rgba(107, 191, 109, 0); }
  }
  .action-instruction {
    padding: 0.4rem;
    font-size: 0.76rem;
    color: #f5c842;
    line-height: 1.4;
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
</style>
