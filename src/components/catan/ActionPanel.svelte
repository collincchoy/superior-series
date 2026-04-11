<script lang="ts">
  import type {
    GameState,
    PlayerId,
    GameAction,
    ImprovementTrack,
    VertexId,
  } from "../../lib/catan/types.js";
  import type { PendingAction } from "../../lib/catan/validTargets.js";
  import { store } from "../../lib/catan/store.svelte.js";
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
  } from "../../lib/catan/rules.js";
  import { buildGraph } from "../../lib/catan/board.js";
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
    science: { label: "🔬 Science", color: "#2f6fe4" },
    trade: { label: "🤝 Trade", color: "#2e9e4f" },
    politics: { label: "⚔️ Politics", color: "#f1c232" },
  };
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
      <span class="group-label">Build</span>
      <div class="group-btns">
        {#if pendingAction?.type === "build_road"}
          <button class="action-btn active" onclick={() => pending(null)}
            >Cancel Road</button
          >
        {:else}
          <button
            class="action-btn"
            onclick={() => pending({ type: "build_road" })}
            disabled={!canRoad}>🛣️ Road</button
          >
        {/if}

        {#if pendingAction?.type === "build_settlement"}
          <button class="action-btn active" onclick={() => pending(null)}
            >Cancel Settlement</button
          >
        {:else}
          <button
            class="action-btn"
            onclick={() => pending({ type: "build_settlement" })}
            disabled={!canSettle}>🏠 Settlement</button
          >
        {/if}

        {#if pendingAction?.type === "build_city"}
          <button class="action-btn active" onclick={() => pending(null)}
            >Cancel City</button
          >
        {:else}
          <button
            class="action-btn"
            onclick={() => pending({ type: "build_city" })}
            disabled={!canCity}>🏙️ City</button
          >
        {/if}

        {#if pendingAction?.type === "build_city_wall"}
          <button class="action-btn active" onclick={() => pending(null)}
            >Cancel Wall</button
          >
        {:else}
          <button
            class="action-btn"
            onclick={() => pending({ type: "build_city_wall" })}
            disabled={!canWall}>🏰 Wall</button
          >
        {/if}
      </div>
    </div>

    <div class="action-group">
      <span class="group-label">Knights</span>
      <div class="group-btns">
        {#if pendingAction?.type === "recruit_knight"}
          <button class="action-btn active" onclick={() => pending(null)}
            >Cancel Knight</button
          >
        {:else}
          <button
            class="action-btn"
            onclick={() => pending({ type: "recruit_knight" })}
            disabled={!canKnight}>⚔️ Knight</button
          >
        {/if}

        {#if pendingAction?.type === "promote_knight"}
          <button class="action-btn active" onclick={() => pending(null)}
            >Cancel Promote</button
          >
        {:else}
          <button
            class="action-btn"
            onclick={() => pending({ type: "promote_knight" })}
            disabled={!canPromote}>⬆️ Promote</button
          >
        {/if}

        {#if pendingAction?.type === "activate_knight"}
          <button class="action-btn active" onclick={() => pending(null)}
            >Cancel Activate</button
          >
        {:else}
          <button
            class="action-btn"
            onclick={() => pending({ type: "activate_knight" })}
            disabled={!canActivate}>🛡️ Activate</button
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
            onclick={() => send({ type: "IMPROVE_CITY", pid, track })}
            disabled={!canImproveCity(board, me, track)}
            style={`background:${trackLabel[track].color};color:${track === "politics" ? "#3f2d00" : "#ffffff"};border-color:rgba(0,0,0,0.35);`}
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

<style>
  .action-panel {
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .action-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .group-label {
    font-size: 0.6rem;
    text-transform: uppercase;
    color: #a0b0a0;
    letter-spacing: 0.08em;
  }
  .group-btns {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .end-turn {
    flex: 1;
  }
  .action-btn {
    background: rgba(255, 255, 255, 0.1);
    color: #f0e8d0;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 5px;
    padding: 0.4rem 0.7rem;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .action-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.18);
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
  }
  .roll-dice-btn:hover {
    background: #4a7a28;
  }
  .action-instruction {
    padding: 0.5rem;
    font-size: 0.8rem;
    color: #f5c842;
    line-height: 1.4;
  }
</style>
