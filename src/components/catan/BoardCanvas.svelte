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
  import CatanPopover from "./CatanPopover.svelte";

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
  const NUMBER_DOT_RADIUS = 3.8;
  const NUMBER_DOT_SPACING = 7;
  const NUMBER_DOT_Y_OFFSET = 19;

  const HARBOR_MARKER_RADIUS = 23;
  const HARBOR_MARKER_FONT_SIZE = 15;

  const ROAD_STROKE = 10;

  const TARGET_EDGE_CAPTURE_STROKE = 40;
  const TARGET_EDGE_VISIBLE_STROKE = 14;
  const TARGET_VERTEX_RADIUS = 20;

  type HarborType = (typeof gameState.board.harbors)[0]["type"];

  type HarborPopoverState = {
    key: string;
    type: HarborType;
    x: number;
    y: number;
  };

  let harborPopover = $state<HarborPopoverState | null>(null);

  function harborRateLabel(type: HarborType) {
    return type === "generic" ? "3:1" : "2:1";
  }

  function harborDescription(type: HarborType) {
    return type === "generic" ? "any resource" : type;
  }

  function closeHarborPopover() {
    harborPopover = null;
  }

  function toggleHarborDetail(
    event: MouseEvent | KeyboardEvent,
    key: string,
    type: HarborType,
  ) {
    event.stopPropagation();
    if (harborPopover?.key === key) {
      harborPopover = null;
      return;
    }

    const trigger = event.currentTarget as Element | null;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const width = 148;
    const x = Math.max(
      8,
      Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8),
    );
    const y = Math.max(8, rect.top - 46);
    harborPopover = { key, type, x, y };
  }

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
    } else if (gameState.pendingKnightPromotions?.pid === pid) {
      s({ type: "PROGRESS_PROMOTE_FREE_KNIGHT", pid, vid });
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
    } else if (gameState.pendingFreeRoads?.pid === pid) {
      s({ type: "PROGRESS_PLACE_FREE_ROAD", pid, eid });
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
        const key = `${v1}-${v2}`;
        return {
          key,
          harbor,
          p1,
          p2,
          outerX: midX + perpX,
          outerY: midY + perpY,
        };
      })
      .filter(Boolean) as Array<{
      key: string;
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
                cx={x + (d - (dots - 1) / 2) * NUMBER_DOT_SPACING}
                cy={y + NUMBER_DOT_Y_OFFSET}
                r={NUMBER_DOT_RADIUS}
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
        {@const showDetail = harborPopover?.key === hp.key}
        <g
          role="button"
          tabindex="0"
          aria-label={`Harbor ${harborDescription(hp.harbor.type)}, ${harborRateLabel(hp.harbor.type)}`}
          style="cursor:pointer"
          onclick={(event) => {
            toggleHarborDetail(event, hp.key, hp.harbor.type);
          }}
          onkeydown={(event) =>
            onKeyActivate(event, () =>
              toggleHarborDetail(event, hp.key, hp.harbor.type))}
        >
          <line
            x1={hp.p1.x}
            y1={hp.p1.y}
            x2={hp.outerX}
            y2={hp.outerY}
            stroke="#5dade2"
            stroke-width="1.8"
            stroke-dasharray="4 3"
            opacity="0.8"
          />
          <line
            x1={hp.p2.x}
            y1={hp.p2.y}
            x2={hp.outerX}
            y2={hp.outerY}
            stroke="#5dade2"
            stroke-width="1.8"
            stroke-dasharray="4 3"
            opacity="0.8"
          />
          <circle
            cx={hp.outerX}
            cy={hp.outerY}
            r={HARBOR_MARKER_RADIUS}
            fill="#1a5276"
            stroke={showDetail ? "#f8d972" : "#8bd2ff"}
            stroke-width={showDetail ? 3 : 2}
          />
          <text
            x={hp.outerX}
            y={hp.outerY + 1}
            text-anchor="middle"
            dominant-baseline="middle"
            font-size={HARBOR_MARKER_FONT_SIZE}
            fill="#ffffff"
            stroke="#0f2e43"
            stroke-width="1"
            paint-order="stroke"
          >
            {HARBOR_ICONS[hp.harbor.type] ?? "?"}
          </text>
        </g>
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
              stroke-width={ROAD_STROKE}
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
                x={p.x - 10}
                y={p.y - 5}
                width="20"
                height="14"
                fill={color}
                stroke="#fff"
                stroke-width="2"
              />
              <polygon
                points={`${p.x},${p.y - 20} ${p.x + 12},${p.y - 5} ${p.x - 12},${p.y - 5}`}
                fill={color}
                stroke="#fff"
                stroke-width="2"
              />
            {:else if building.type === "city"}
              <!-- City: wide base + tower -->
              <rect
                x={p.x - 14}
                y={p.y - 9}
                width="28"
                height="18"
                fill={color}
                stroke="#fff"
                stroke-width="2"
              />
              <rect
                x={p.x - 7}
                y={p.y - 21}
                width="14"
                height="12"
                fill={color}
                stroke="#fff"
                stroke-width="2"
              />
              {#if building.hasWall}
                <rect
                  x={p.x - 18}
                  y={p.y + 9}
                  width="36"
                  height="6"
                  fill="#8b6914"
                  stroke="#fff"
                  stroke-width="1"
                />
              {/if}
              {#if building.metropolis !== null}
                <text x={p.x} y={p.y - 24} text-anchor="middle" font-size="14"
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
            {@const r = knight.strength === 1 ? 15 : knight.strength === 2 ? 19 : 23}
            {@const fill = knight.active ? color : "#aaa"}
            {@const stroke = knight.active ? "#fff" : "#4f4f4f"}
            {@const ringStroke = knight.active ? "#ffffff" : "#3a3a3a"}
            {@const fontSize = knight.strength === 1 ? 13 : knight.strength === 2 ? 16 : 19}
            <g>
              <title>
                {`${gameState.players[knight.playerId]?.name ?? knight.playerId} level ${knight.strength} knight (${knight.active ? "active" : "inactive"})`}
              </title>
              <circle
                cx={p.x}
                cy={p.y}
                {r}
                {fill}
                {stroke}
                stroke-width="3"
              />
              {#if knight.strength >= 2}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r - 4}
                  fill="none"
                  stroke={ringStroke}
                  stroke-width="1.6"
                  opacity="0.9"
                />
              {/if}
              {#if knight.strength === 3}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r - 7}
                  fill="none"
                  stroke={ringStroke}
                  stroke-width="1.4"
                  stroke-dasharray="2.5 2"
                  opacity="0.95"
                />
              {/if}
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
            stroke-width={TARGET_EDGE_CAPTURE_STROKE}
            opacity="0.02"
            stroke-linecap="round"
            style="cursor:pointer"
            role="button"
            tabindex="0"
            aria-label="Select road placement"
            onclick={() => onEdgeClick(eid)}
            onkeydown={(event) => onKeyActivate(event, () => onEdgeClick(eid))}
          />
          <line
            x1={pts[0].x}
            y1={pts[0].y}
            x2={pts[1].x}
            y2={pts[1].y}
            stroke="#ffcc00"
            stroke-width={TARGET_EDGE_VISIBLE_STROKE}
            opacity="0.58"
            stroke-linecap="round"
            style="pointer-events:none"
          />
        {/if}
      {/each}
      {#each targets.validVertices as vid}
        {@const p = getVertexPixel(vid)}
        {#if p}
          <circle
            cx={p.x}
            cy={p.y}
            r={TARGET_VERTEX_RADIUS}
            fill="#ffcc00"
            opacity="0.58"
            stroke="#fff3bf"
            stroke-width="2"
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

  <CatanPopover
    open={!!harborPopover}
    x={harborPopover?.x ?? 0}
    y={harborPopover?.y ?? 0}
    ariaLabel="Close harbor details"
    onClose={closeHarborPopover}
  >
    {#if harborPopover}
      <div class="harbor-popover">
        {harborRateLabel(harborPopover.type)} {harborDescription(harborPopover.type)}
      </div>
    {/if}
  </CatanPopover>
</div>

<style>
  .board-area {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(ellipse at 50% 50%, #1c4272 0%, #193c6a 55%, #153460 100%);
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

  .harbor-popover {
    min-width: 120px;
    border-radius: 8px;
    border: 2px solid #8bd2ff;
    background: rgba(16, 47, 70, 0.96);
    color: #ffffff;
    font-size: 0.88rem;
    font-weight: 700;
    text-align: center;
    padding: 0.36rem 0.52rem;
    white-space: nowrap;
    box-shadow: 0 5px 14px rgba(0, 0, 0, 0.35);
  }

  @media (min-width: 700px) {
    .board-area {
      flex: 1;
    }
  }
</style>
