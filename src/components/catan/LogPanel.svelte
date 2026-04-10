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
