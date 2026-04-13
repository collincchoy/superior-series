<script lang="ts">
  import CastleSvg from "./CastleSvg.svelte";
  import DragonSvg from "./DragonSvg.svelte";
  import KnightSvg from "./KnightSvg.svelte";
  import RainSvg from "./RainSvg.svelte";
</script>

<svg
  class="pixel-scene"
  viewBox="0 0 320 568"
  preserveAspectRatio="xMidYMax meet"
  aria-hidden="true"
>
  <defs>
    <linearGradient id="skyGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a1030" />
      <stop offset="50%" stop-color="#120a22" />
      <stop offset="100%" stop-color="#06040e" />
    </linearGradient>
    <filter id="moonGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="6" />
    </filter>
  </defs>

  <rect id="sky" x="0" y="0" width="320" height="568" fill="url(#skyGradient)" />

  <g id="clouds" opacity="0.8">
    <rect x="12" y="62" width="92" height="18" fill="#1a1228" />
    <rect x="28" y="52" width="70" height="14" fill="#1a1228" />
    <rect x="206" y="74" width="98" height="16" fill="#1a1228" />
    <rect x="224" y="62" width="72" height="14" fill="#1a1228" />
    <rect x="88" y="96" width="62" height="12" fill="#1a1228" />
  </g>

  <DragonSvg />

  <CastleSvg />

  <rect id="ground" x="0" y="362" width="320" height="206" fill="#0d1a0d" />
  <rect x="0" y="358" width="320" height="6" fill="#16291a" opacity="0.8" />

  <KnightSvg />

  <RainSvg />
</svg>

<style>
  .pixel-scene {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
    shape-rendering: crispEdges;
    image-rendering: pixelated;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .pixel-scene :global(*) {
      animation: none !important;
    }
  }
</style>
