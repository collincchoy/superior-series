<script lang="ts">
  import { tick } from 'svelte';

  let { log }: { log: string[] } = $props();

  let el: HTMLDivElement;

  $effect(() => {
    // access log so the effect re-runs when it changes
    log.length;
    tick().then(() => { if (el) el.scrollTop = el.scrollHeight; });
  });
</script>

<div class="log-panel" bind:this={el}>
  {#each log.slice(-8) as line}
    <div class="log-line">{line}</div>
  {/each}
</div>

<style>
  .log-panel {
    padding: 0.4rem 0.8rem;
    font-size: 0.7rem;
    color: #a0b0a0;
    max-height: 6rem;
    overflow-y: auto;
    flex: 1;
  }

  .log-line {
    padding: 0.1rem 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
</style>
