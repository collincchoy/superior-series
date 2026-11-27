<script lang="ts">
  import { onMount } from "svelte";

  let container = $state<HTMLDivElement | undefined>(undefined);

  onMount(() => {
    if (!container) return;
    const parent = container;
    let game: { destroy(removeCanvas: boolean): void } | undefined;
    let cancelled = false;

    // Load Phaser lazily so it stays out of the rest of the site's bundles.
    import("../../lib/arni/createGame.js").then(({ createGame }) => {
      if (cancelled) return;
      game = createGame(parent, import.meta.env.BASE_URL);
    });

    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  });
</script>

<div class="stage" bind:this={container}></div>
<p class="hint">← → move · Space jump · X tail whip · ↓ crawl/slide · hold ↓ + jump: super jump · Esc pause</p>
<!-- Phones held upright: the game is wide, so ask to turn sideways (CSS only shows this on touch + portrait). -->
<div class="rotate" aria-live="polite">
  <div class="phone">📱</div>
  <p>Turn your device sideways to play!</p>
</div>

<style>
  .rotate {
    display: none;
  }

  /* Touch screens: the on-screen buttons replace the keyboard hint. */
  @media (pointer: coarse) {
    .hint {
      display: none;
    }
  }

  @media (pointer: coarse) and (orientation: portrait) {
    .rotate {
      position: fixed;
      inset: 0;
      z-index: 10;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      background: #3a2f66;
      color: #fff;
      font: 700 24px system-ui, sans-serif;
      text-align: center;
      padding: 24px;
    }

    .phone {
      font-size: 72px;
      animation: tilt 1.6s ease-in-out infinite;
    }
  }

  @keyframes tilt {
    0%,
    30% {
      transform: rotate(0deg);
    }
    60%,
    100% {
      transform: rotate(-90deg);
    }
  }

  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
    width: 100%;
  }

  .hint {
    position: fixed;
    left: 50%;
    bottom: 10px;
    transform: translateX(-50%);
    padding: 4px 12px;
    border-radius: 999px;
    background: rgb(0 0 0 / 35%);
    color: #fff;
    font: 600 14px system-ui, sans-serif;
    pointer-events: none;
  }
</style>
