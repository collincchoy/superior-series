<script module lang="ts">
  export type BoardPieceGlyphKind = "road" | "settlement" | "city" | "cityWall" | "knight";
</script>

<script lang="ts">
  import { SETTLEMENT_BOARD_SCALE } from "../../lib/catan/svgHelpers.js";

  let {
    piece,
    playerColor,
    knightStrength = 1 as 1 | 2 | 3,
    ghost = false,
    size = "md" as "md" | "sm" | "xs",
  }: {
    piece: BoardPieceGlyphKind;
    playerColor: string;
    knightStrength?: 1 | 2 | 3;
    /** Outline / depleted look */
    ghost?: boolean;
    size?: "md" | "sm" | "xs";
  } = $props();

  let fillMain = $derived(
    ghost ? "rgba(120,120,120,0.28)" : playerColor || "#888",
  );
  let strokeOuter = $derived(ghost ? "rgba(200,200,200,0.45)" : "#fff");
  let roadStroke = $derived(ghost ? "rgba(150,150,150,0.75)" : playerColor || "#888");
  let wallFill = "#8b6914";
  let knightFill = $derived(ghost ? "rgba(168,168,168,0.45)" : playerColor || "#888");
  let knightStroke = $derived(ghost ? "#7a7a7a" : "#fff");

  /**
   * Knight figure: round helmet-head on top of a wider body.
   * cx/cy = center of body base, w = body width, h = total height.
   */
  function knightFig(cx: number, cy: number, w: number, h: number): string {
    const hR = w * 0.30;          // head radius
    const headCy = cy - h * 0.30; // head center
    const k = hR * 0.552;         // bezier circle constant
    return [
      `M ${cx - hR} ${headCy}`,
      `C ${cx - hR} ${headCy - k}  ${cx - k} ${headCy - hR}  ${cx} ${headCy - hR}`,
      `C ${cx + k} ${headCy - hR}  ${cx + hR} ${headCy - k}  ${cx + hR} ${headCy}`,
      `L ${cx + w * 0.16} ${cy - h * 0.06}`,
      `Q ${cx + w * 0.52} ${cy + h * 0.15}  ${cx + w * 0.46} ${cy + h * 0.42}`,
      `L ${cx - w * 0.46} ${cy + h * 0.42}`,
      `Q ${cx - w * 0.52} ${cy + h * 0.15}  ${cx - w * 0.16} ${cy - h * 0.06}`,
      `Z`,
    ].join(' ');
  }
</script>

<!-- Geometry aligned with BoardCanvas.svelte (buildings / road / knight). -->
<svg
  class={[
    "piece-glyph-svg",
    size === "sm" && "piece-glyph-svg-sm",
    size === "xs" && "piece-glyph-svg-xs",
  ]}
  viewBox="0 0 48 52"
  aria-hidden="true"
>
  <defs>
    <linearGradient id="piece-shade" x1="0%" y1="0%" x2="50%" y2="100%">
      <stop offset="0%"   stop-color="white" stop-opacity="0.35" />
      <stop offset="100%" stop-color="black"  stop-opacity="0.25" />
    </linearGradient>
  </defs>

  {#if piece === "road"}
    <line x1="11" y1="40" x2="37" y2="16" stroke={roadStroke} stroke-width="7" stroke-linecap="square" />
  {:else if piece === "settlement"}
    <!-- Match board: scale from bottom-center (24,44) so city reads larger in HUD -->
    <g transform={`translate(24 44) scale(${SETTLEMENT_BOARD_SCALE}) translate(-24 -44)`}>
      <!-- Roof -->
      <polygon
        points="24,16 38,30 10,30"
        fill={fillMain}
        stroke={strokeOuter}
        stroke-width="1.75"
        stroke-linejoin="round"
      />
      {#if !ghost}
        <polygon points="24,16 38,30 10,30" fill="url(#piece-shade)" />
      {/if}
      <!-- Base -->
      <rect x="11" y="30" width="26" height="14" rx="1" fill={fillMain} stroke={strokeOuter} stroke-width="1.75" />
      {#if !ghost}
        <rect x="11" y="30" width="26" height="14" rx="1" fill="url(#piece-shade)" />
      {/if}
      <!-- Ridge shadow -->
      <line x1="11" y1="30" x2="37" y2="30" stroke="rgba(0,0,0,0.18)" stroke-width="1" />
    </g>
  {:else if piece === "city"}
    <!-- City body: single stepped path (base + left house + tower), no internal seams -->
    <path d="M 6,47 L 42,47 L 42,16 L 21,16 L 21,30 L 6,30 Z" fill={fillMain} stroke={strokeOuter} stroke-width="1.75" stroke-linejoin="round" />
    {#if !ghost}<path d="M 6,47 L 42,47 L 42,16 L 21,16 L 21,30 L 6,30 Z" fill="url(#piece-shade)" />{/if}
    <!-- Tower roof -->
    <polygon points="31,8 42,16 21,16" fill={fillMain} stroke={strokeOuter} stroke-width="1.75" stroke-linejoin="round" />
    {#if !ghost}<polygon points="31,8 42,16 21,16" fill="url(#piece-shade)" />{/if}
    <!-- Eave shadow at tower/roof junction -->
    <line x1="21" y1="16" x2="42" y2="16" stroke="rgba(0,0,0,0.18)" stroke-width="1" />
  {:else if piece === "cityWall"}
    <!-- Wall platform with battlements to distinguish from city base -->
    <rect x="6" y="40" width="36" height="7" rx="2" fill={fillMain} stroke={strokeOuter} stroke-width="1.75" />
    <rect x="8"  y="36" width="5" height="4" rx="1" fill={fillMain} stroke={strokeOuter} stroke-width="1.5" />
    <rect x="18" y="36" width="5" height="4" rx="1" fill={fillMain} stroke={strokeOuter} stroke-width="1.5" />
    <rect x="30" y="36" width="5" height="4" rx="1" fill={fillMain} stroke={strokeOuter} stroke-width="1.5" />
    {#if !ghost}
      <rect x="6" y="40" width="36" height="7" rx="2" fill="url(#piece-shade)" />
      <rect x="8"  y="36" width="5" height="4" rx="1" fill="url(#piece-shade)" />
      <rect x="18" y="36" width="5" height="4" rx="1" fill="url(#piece-shade)" />
      <rect x="30" y="36" width="5" height="4" rx="1" fill="url(#piece-shade)" />
    {/if}
  {:else if piece === "knight"}
    {#if knightStrength === 1}
      <!-- lv1: single figure, same size as one lv3 figure -->
      <path d={knightFig(24, 30, 16, 36)} fill={knightFill} stroke={knightStroke} stroke-width="1.5" />
      {#if !ghost}<path d={knightFig(24, 30, 16, 36)} fill="url(#piece-shade)" />{/if}
    {:else if knightStrength === 2}
      <!-- lv2: 2 figures, same size as lv3, centered with matching gap -->
      {#each [17, 31] as cx}
        <path d={knightFig(cx, 30, 16, 36)} fill={knightFill} stroke={knightStroke} stroke-width="1.5" />
        {#if !ghost}<path d={knightFig(cx, 30, 16, 36)} fill="url(#piece-shade)" />{/if}
      {/each}
    {:else}
      <!-- lv3: 3 figures squished together -->
      {#each [11, 24, 37] as cx}
        <path d={knightFig(cx, 30, 16, 36)} fill={knightFill} stroke={knightStroke} stroke-width="1.5" />
        {#if !ghost}<path d={knightFig(cx, 30, 16, 36)} fill="url(#piece-shade)" />{/if}
      {/each}
    {/if}
  {/if}
</svg>

<style>
  .piece-glyph-svg {
    display: block;
    width: 2.85rem;
    height: 2.85rem;
    flex-shrink: 0;
  }
  .piece-glyph-svg-sm {
    width: 2.1rem;
    height: 2.1rem;
  }
  .piece-glyph-svg-xs {
    width: 1.75rem;
    height: 1.75rem;
  }
</style>
