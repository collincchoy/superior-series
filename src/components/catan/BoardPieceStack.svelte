<script lang="ts">
  import BoardPieceGlyph from "./BoardPieceGlyph.svelte";
  import type { BoardPieceGlyphKind } from "./BoardPieceGlyph.svelte";

  let {
    piece,
    count,
    playerColor,
    maxVisibleLayers = 5,
    knightStrength = 1 as 1 | 2 | 3,
    compact = false,
  }: {
    piece: BoardPieceGlyphKind;
    count: number;
    playerColor: string;
    maxVisibleLayers?: number;
    knightStrength?: 1 | 2 | 3;
    compact?: boolean;
  } = $props();

  let ghost = $derived(count <= 0);
  let layersShown = $derived(ghost ? 1 : Math.min(count, Math.max(maxVisibleLayers, 1)));
  let overflowExtras = $derived(!ghost && count > maxVisibleLayers ? count - maxVisibleLayers : 0);

  let layerIndexes = $derived(Array.from({ length: layersShown }, (_, i) => i));

  const dx = compact ? 1.2 : 1.75;
  const dyDefault = compact ? -2.85 : -3.85;
  const dyRoad = compact ? -2.35 : -3.05;
  let dyStep = $derived(piece === "road" ? dyRoad : dyDefault);
</script>

<div class={["piece-stack", compact && "piece-stack-compact"]} aria-hidden="true">
  {#each layerIndexes as i (`${piece}-s${knightStrength}-l${i}`)}
    <div
      class="piece-stack-layer"
      style="transform: translate(calc(-50% + {i * dx}px), {i * dyStep}px); z-index: {i + 5};"
    >
      <BoardPieceGlyph
        {piece}
        {playerColor}
        {ghost}
        {knightStrength}
        size={compact ? "sm" : "md"}
      />
    </div>
  {/each}
  {#if overflowExtras > 0}
    <span class="piece-stack-badge">+{overflowExtras}</span>
  {/if}
</div>

<style>
  .piece-stack {
    position: relative;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    flex: 1;
    width: 100%;
    box-sizing: border-box;
    padding-top: 5px;
    min-height: 2.95rem;
    max-height: 3.95rem;
    overflow: hidden;
    pointer-events: none;
  }

  .piece-stack-compact {
    min-height: 2.55rem;
    max-height: 3.35rem;
  }

  .piece-stack-layer {
    position: absolute;
    left: 50%;
    bottom: 4px;
  }

  .piece-stack-badge {
    position: absolute;
    top: 2px;
    right: 2px;
    z-index: 40;
    min-width: 1.05rem;
    padding: 0.06rem 0.18rem;
    border-radius: 4px;
    font-size: 0.54rem;
    font-weight: 800;
    line-height: 1.05;
    color: #eef6ee;
    background: rgba(20, 32, 20, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }
</style>
