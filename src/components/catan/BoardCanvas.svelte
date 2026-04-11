<script lang="ts">
  import type {
    GameState,
    PlayerId,
    VertexId,
    EdgeId,
    HexId,
  } from "../../lib/catan/types.js";
  import type {
    PendingAction,
    ValidTargets,
  } from "../../lib/catan/validTargets.js";
  import { computeValidTargets } from "../../lib/catan/validTargets.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import { isPlayerActing } from "../../lib/catan/turnActors.js";
  import {
    HEX_SIZE,
    TERRAIN_COLORS,
    TERRAIN_ICONS,
    NUMBER_DOTS,
    HARBOR_ICONS,
    hexPoints,
    hexCenter,
    getVertexPixel,
    getEdgePoints,
    CATAN_HEX_COORDS,
    hexId,
  } from "../../lib/catan/svgHelpers.js";
  import { buildGraph } from "../../lib/catan/board.js";

  let {
    gameState,
    localPid,
    pendingAction,
  }: {
    gameState: GameState;
    localPid: PlayerId;
    pendingAction: PendingAction | null;
  } = $props();

  const graph = buildGraph();

  let targets: ValidTargets = $derived(
    computeValidTargets(gameState, localPid, pendingAction),
  );
  let isMyTurn = $derived(isPlayerActing(gameState, localPid));

  const KNIGHT_EMOJI = "⚔️";

  function onKeyActivate(event: KeyboardEvent, action: () => void) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    action();
  }

  function onVertexClick(vid: VertexId) {
    if (!isMyTurn) return;
    const pid = localPid;
    function s(action: any) {
      store.setPendingAction(null);
      store.sendAction(action);
    }

    if (gameState.phase === "SETUP_R1_SETTLEMENT") {
      s({ type: "PLACE_BUILDING", pid, vid, building: "settlement" });
    } else if (gameState.phase === "SETUP_R2_CITY") {
      s({ type: "PLACE_BUILDING", pid, vid, building: "city" });
    } else if (
      gameState.phase === "KNIGHT_DISPLACE_RESPONSE" &&
      gameState.pendingDisplace?.displacedPlayerId === pid
    ) {
      s({
        type: "DISPLACED_MOVE",
        pid,
        from: gameState.pendingDisplace.displacedKnightVertex,
        to: vid,
      });
    } else if (pendingAction?.type === "build_settlement") {
      s({ type: "BUILD_SETTLEMENT", pid, vid });
    } else if (pendingAction?.type === "build_city") {
      s({ type: "BUILD_CITY", pid, vid });
    } else if (pendingAction?.type === "build_city_wall") {
      s({ type: "BUILD_CITY_WALL", pid, vid });
    } else if (pendingAction?.type === "recruit_knight") {
      s({ type: "RECRUIT_KNIGHT", pid, vid });
    } else if (pendingAction?.type === "promote_knight") {
      s({ type: "PROMOTE_KNIGHT", pid, vid });
    } else if (pendingAction?.type === "activate_knight") {
      s({ type: "ACTIVATE_KNIGHT", pid, vid });
    }
  }

  function onEdgeClick(eid: EdgeId) {
    if (!isMyTurn) return;
    const pid = localPid;
    function s(action: any) {
      store.setPendingAction(null);
      store.sendAction(action);
    }

    if (
      gameState.phase === "SETUP_R1_ROAD" ||
      gameState.phase === "SETUP_R2_ROAD"
    ) {
      s({ type: "PLACE_ROAD", pid, eid });
    } else if (pendingAction?.type === "build_road") {
      s({ type: "BUILD_ROAD", pid, eid });
    }
  }

  function onHexClick(hid: HexId) {
    if (!isMyTurn || gameState.phase !== "ROBBER_MOVE") return;
    const pid = localPid;
    const adjacentBuildings = Object.entries(gameState.board.vertices).filter(
      ([vid, b]) => {
        if (!b || b.playerId === pid) return false;
        return (graph.hexesOfVertex[vid as VertexId] ?? []).includes(hid);
      },
    );
    const stealFrom = adjacentBuildings[0]?.[1]?.playerId ?? null;
    store.sendAction({ type: "MOVE_ROBBER", pid, hid, stealFrom });
  }

  // Precompute harbor positions (pure derived data)
  let harborPositions = $derived(
    gameState.board.harbors
      .map((harbor) => {
        const [v1, v2] = harbor.vertices;
        if (!v1 || !v2) return null;
        const p1 = getVertexPixel(v1);
        const p2 = getVertexPixel(v2);
        if (!p1 || !p2) return null;
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const perpX1 = (-dy / len) * 30,
          perpY1 = (dx / len) * 30;
        const perpX2 = (dy / len) * 30,
          perpY2 = (-dx / len) * 30;
        const dist1 = (midX + perpX1) ** 2 + (midY + perpY1) ** 2;
        const dist2 = (midX + perpX2) ** 2 + (midY + perpY2) ** 2;
        const [perpX, perpY] =
          dist1 > dist2 ? [perpX1, perpY1] : [perpX2, perpY2];
        return { harbor, p1, p2, outerX: midX + perpX, outerY: midY + perpY };
      })
      .filter(Boolean) as Array<{
      harbor: (typeof gameState.board.harbors)[0];
      p1: { x: number; y: number };
      p2: { x: number; y: number };
      outerX: number;
      outerY: number;
    }>,
  );
</script>

<div class="board-area">
  <svg
    class="board-svg"
    viewBox="-420 -400 840 800"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <filter id="drop-shadow">
        <feDropShadow dx="1" dy="1" stdDeviation="2" flood-opacity="0.4" />
      </filter>
    </defs>

    <!-- ── Hexes ── -->
    <g id="hexes">
      {#each CATAN_HEX_COORDS as coord}
        {@const hid = hexId(coord)}
        {@const hex = gameState.board.hexes[hid]}
        {#if hex}
          {@const { x, y } = hexCenter(coord)}
          {@const pts = hexPoints(x, y, HEX_SIZE - 2)}
          {@const isValidHex = targets.validHexes.has(hid)}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <polygon
            points={pts}
            fill={TERRAIN_COLORS[hex.terrain]}
            stroke={isValidHex ? "#ffcc00" : "#3a2a1a"}
            stroke-width={isValidHex ? 4 : 2}
            class={isValidHex ? "valid-hex" : undefined}
            style={isValidHex ? "cursor:pointer" : undefined}
            role={isValidHex ? "button" : undefined}
            tabindex={isValidHex ? 0 : undefined}
            aria-label={isValidHex ? "Move robber here" : undefined}
            onclick={isValidHex ? () => onHexClick(hid) : undefined}
            onkeydown={isValidHex
              ? (event) => onKeyActivate(event, () => onHexClick(hid))
              : undefined}
          />
          <text
            {x}
            y={y - HEX_SIZE * 0.35}
            text-anchor="middle"
            dominant-baseline="middle"
            font-size="28"
          >
            {TERRAIN_ICONS[hex.terrain]}
          </text>
        {/if}
      {/each}
    </g>

    <!-- ── Number Tokens ── -->
    <g id="numbers">
      {#each CATAN_HEX_COORDS as coord}
        {@const hid = hexId(coord)}
        {@const hex = gameState.board.hexes[hid]}
        {#if hex && hex.number !== null}
          {@const { x, y } = hexCenter(coord)}
          {@const isRed = hex.number === 6 || hex.number === 8}
          {#if hex.hasRobber}
            <text {x} y={y + 5} text-anchor="middle" font-size="40">👺</text>
          {:else}
            <circle
              cx={x}
              cy={y}
              r="24"
              fill="#f5e6c8"
              stroke="#8b6914"
              stroke-width="1.5"
            />
            <text
              {x}
              y={y + 1}
              text-anchor="middle"
              dominant-baseline="middle"
              font-size="21"
              font-weight="bold"
              fill={isRed ? "#cc2200" : "#2c1a0a"}
            >
              {hex.number}
            </text>
            {#each Array.from({ length: NUMBER_DOTS[hex.number] ?? 0 }, (_, d) => d) as d}
              {@const dots = NUMBER_DOTS[hex.number] ?? 0}
              <circle
                cx={x + (d - (dots - 1) / 2) * 6}
                cy={y + 18}
                r="2.5"
                fill={isRed ? "#cc2200" : "#2c1a0a"}
              />
            {/each}
          {/if}
        {/if}
      {/each}
    </g>

    <!-- ── Harbors ── -->
    <g id="harbors">
      {#each harborPositions as hp}
        <line
          x1={hp.p1.x}
          y1={hp.p1.y}
          x2={hp.outerX}
          y2={hp.outerY}
          stroke="#5dade2"
          stroke-width="1.5"
          stroke-dasharray="4 3"
          opacity="0.7"
        />
        <line
          x1={hp.p2.x}
          y1={hp.p2.y}
          x2={hp.outerX}
          y2={hp.outerY}
          stroke="#5dade2"
          stroke-width="1.5"
          stroke-dasharray="4 3"
          opacity="0.7"
        />
        <circle
          cx={hp.outerX}
          cy={hp.outerY}
          r="17"
          fill="#1a5276"
          stroke="#5dade2"
          stroke-width="1.5"
        />
        <text
          x={hp.outerX}
          y={hp.outerY + 1}
          text-anchor="middle"
          dominant-baseline="middle"
          font-size="11"
          fill="white"
        >
          {HARBOR_ICONS[hp.harbor.type] ?? "?"}
        </text>
      {/each}
    </g>

    <!-- ── Roads ── -->
    <g id="roads">
      {#each Object.entries(gameState.board.edges) as [eid, road]}
        {#if road}
          {@const pts = getEdgePoints(eid as EdgeId)}
          {#if pts}
            {@const color = gameState.players[road.playerId]?.color ?? "#999"}
            <line
              x1={pts[0].x}
              y1={pts[0].y}
              x2={pts[1].x}
              y2={pts[1].y}
              stroke={color}
              stroke-width="8"
              stroke-linecap="round"
            />
          {/if}
        {/if}
      {/each}
    </g>

    <!-- ── Buildings ── -->
    <g id="buildings">
      {#each Object.entries(gameState.board.vertices) as [vid, building]}
        {#if building}
          {@const p = getVertexPixel(vid as VertexId)}
          {#if p}
            {@const color =
              gameState.players[building.playerId]?.color ?? "#999"}
            {#if building.type === "settlement"}
              <!-- Settlement: square base + triangle roof -->
              <rect
                x={p.x - 8}
                y={p.y - 4}
                width="16"
                height="12"
                fill={color}
                stroke="#fff"
                stroke-width="1.5"
              />
              <polygon
                points={`${p.x},${p.y - 16} ${p.x + 10},${p.y - 4} ${p.x - 10},${p.y - 4}`}
                fill={color}
                stroke="#fff"
                stroke-width="1.5"
              />
            {:else if building.type === "city"}
              <!-- City: wide base + tower -->
              <rect
                x={p.x - 12}
                y={p.y - 8}
                width="24"
                height="16"
                fill={color}
                stroke="#fff"
                stroke-width="2"
              />
              <rect
                x={p.x - 6}
                y={p.y - 18}
                width="12"
                height="10"
                fill={color}
                stroke="#fff"
                stroke-width="2"
              />
              {#if building.hasWall}
                <rect
                  x={p.x - 16}
                  y={p.y + 8}
                  width="32"
                  height="5"
                  fill="#8b6914"
                  stroke="#fff"
                  stroke-width="1"
                />
              {/if}
              {#if building.metropolis !== null}
                <text x={p.x} y={p.y - 20} text-anchor="middle" font-size="12"
                  >👑</text
                >
              {/if}
            {/if}
          {/if}
        {/if}
      {/each}
    </g>

    <!-- ── Knights ── -->
    <g id="knights">
      {#each Object.entries(gameState.board.knights) as [vid, knight]}
        {#if knight}
          {@const p = getVertexPixel(vid as VertexId)}
          {#if p}
            {@const color = gameState.players[knight.playerId]?.color ?? "#999"}
            {@const r = knight.strength === 1 ? 12 : knight.strength === 2 ? 16 : 20}
            {@const fill = knight.active ? color : "#aaa"}
            {@const stroke = knight.active ? "#fff" : color}
            {@const fontSize = knight.strength === 1 ? 12 : knight.strength === 2 ? 14 : 18}
            <g>
              <circle
                cx={p.x}
                cy={p.y}
                {r}
                {fill}
                {stroke}
                stroke-width="2"
              />
              <text
                x={p.x}
                y={p.y + 2}
                text-anchor="middle"
                dominant-baseline="middle"
                font-size={fontSize}
              >
                {KNIGHT_EMOJI}
              </text>
            </g>
          {/if}
        {/if}
      {/each}
    </g>

    <!-- ── Tokens (Merchant) ── -->
    <g id="tokens">
      {#if gameState.board.merchantHex}
        {@const coord = CATAN_HEX_COORDS.find(
          (c) => hexId(c) === gameState.board.merchantHex,
        )}
        {#if coord}
          {@const { x, y } = hexCenter(coord)}
          <text x={x + 20} y={y - 20} font-size="18">🏪</text>
        {/if}
      {/if}
    </g>

    <!-- ── Valid Targets (rendered last so they appear on top of all pieces) ── -->
    <g id="targets">
      {#each targets.validEdges as eid}
        {@const pts = getEdgePoints(eid)}
        {#if pts}
          <line
            x1={pts[0].x}
            y1={pts[0].y}
            x2={pts[1].x}
            y2={pts[1].y}
            stroke="#ffcc00"
            stroke-width="12"
            opacity="0.4"
            stroke-linecap="round"
            style="cursor:pointer"
            role="button"
            tabindex="0"
            aria-label="Select road placement"
            onclick={() => onEdgeClick(eid)}
            onkeydown={(event) => onKeyActivate(event, () => onEdgeClick(eid))}
          />
        {/if}
      {/each}
      {#each targets.validVertices as vid}
        {@const p = getVertexPixel(vid)}
        {#if p}
          <circle
            cx={p.x}
            cy={p.y}
            r="14"
            fill="#ffcc00"
            opacity="0.5"
            style="cursor:pointer"
            role="button"
            tabindex="0"
            aria-label="Select board position"
            onclick={() => onVertexClick(vid)}
            onkeydown={(event) =>
              onKeyActivate(event, () => onVertexClick(vid))}
          />
        {/if}
      {/each}
    </g>
  </svg>
</div>

<style>
  .board-area {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #1a3a6e;
    overflow: hidden;
  }

  .board-svg {
    width: 100%;
    height: 100%;
    max-height: 100%;
    max-width: 100%;
  }

  :global(.valid-hex) {
    cursor: pointer;
  }

  /* Decorative overlays should not block hex hit-testing. */
  .board-svg :global(#hexes text),
  .board-svg :global(#numbers) {
    pointer-events: none;
  }

  @media (min-width: 700px) {
    .board-area {
      flex: 1;
    }
  }
</style>
