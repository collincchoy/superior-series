<script module lang="ts">
  export type BoardPieceGlyphKind = "road" | "settlement" | "city" | "cityWall" | "knight";
</script>

<script lang="ts">
  let {
    piece,
    playerColor,
    knightStrength = 1 as 1 | 2 | 3,
    ghost = false,
    size = "md" as "md" | "sm",
  }: {
    piece: BoardPieceGlyphKind;
    playerColor: string;
    knightStrength?: 1 | 2 | 3;
    /** Outline / depleted look */
    ghost?: boolean;
    size?: "md" | "sm";
  } = $props();

  const KNIGHT_SYMBOL = "\u2694"; /* same symbol as BoardCanvas knight label */

  let fillMain = $derived(
    ghost ? "rgba(120,120,120,0.28)" : playerColor || "#888",
  );
  let strokeOuter = $derived(ghost ? "rgba(200,200,200,0.45)" : "#fff");
  let roadStroke = $derived(ghost ? "rgba(150,150,150,0.75)" : playerColor || "#888");
  let wallFill = "#8b6914";
  let knightFill = $derived(ghost ? "rgba(168,168,168,0.45)" : playerColor || "#888");
  let knightStroke = $derived(ghost ? "#7a7a7a" : "#fff");
  let ringStroke = $derived(ghost ? "rgba(200,200,200,0.5)" : "#fff");
</script>

<!-- Geometry aligned with BoardCanvas.svelte (buildings / road / knight). -->
<svg
  class={["piece-glyph-svg", size === "sm" && "piece-glyph-svg-sm"]}
  viewBox="0 0 48 52"
  aria-hidden="true"
>
  {#if piece === "road"}
    <line x1="12" y1="39" x2="35" y2="17" stroke={roadStroke} stroke-width={ghost ? "3" : "4"} stroke-linecap="round" />
  {:else if piece === "settlement"}
    <polygon
      points="24,20 37,31 13,31"
      fill={fillMain}
      stroke={strokeOuter}
      stroke-width="1.75"
      stroke-linejoin="round"
    />
    <rect x="13" y="31" width="22" height="13" rx="1" fill={fillMain} stroke={strokeOuter} stroke-width="1.75" />
  {:else if piece === "city" || piece === "cityWall"}
    <rect x="17" y="17" width="14" height="14" rx="1" fill={fillMain} stroke={strokeOuter} stroke-width="1.75" />
    <rect x="9" y="30" width="30" height="17" rx="1" fill={fillMain} stroke={strokeOuter} stroke-width="1.75" />
    {#if piece === "cityWall"}
      <rect x="6" y="43" width="36" height="6" fill={wallFill} stroke={strokeOuter} stroke-width="1" />
    {/if}
  {:else if piece === "knight"}
    {@const cx = 24}
    {@const cy = 30}
    {@const r = knightStrength === 1 ? 10 : knightStrength === 2 ? 12 : 13.5}
    <circle cx={cx} cy={cy} r={r} fill={knightFill} stroke={knightStroke} stroke-width="2.2" />
    {#if knightStrength >= 2}
      <circle
        cx={cx}
        cy={cy}
        r={r - 3}
        fill="none"
        stroke={ringStroke}
        stroke-width="1.3"
        opacity="0.9"
      />
    {/if}
    {#if knightStrength === 3}
      <circle
        cx={cx}
        cy={cy}
        r={r - 5}
        fill="none"
        stroke={ringStroke}
        stroke-width="1.15"
        stroke-dasharray="2 2"
        opacity="0.95"
      />
    {/if}
    {#if ghost}
      <circle cx={cx} cy={cy} r={r + 2} fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" />
    {/if}
    <text
      x={cx}
      y={cy}
      dominant-baseline="central"
      text-anchor="middle"
      fill={ghost ? "#888" : "#1a1a1a"}
      font-size={knightStrength === 3 ? "11" : knightStrength === 2 ? "10" : "9"}
      style="paint-order: stroke; stroke: rgba(255,255,255,0.5); stroke-width: 3px;"
    >
      {KNIGHT_SYMBOL}</text>
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
</style>
