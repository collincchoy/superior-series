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

<style>
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
