<script lang="ts">
  let { expanded = false }: { expanded?: boolean } = $props();
</script>

<svg
  class="chevron"
  class:expanded
  viewBox="0 0 12 12"
  aria-hidden="true"
  focusable="false"
>
  <line x1="3" y1="2" x2="8" y2="6" />
  <line x1="3" y1="10" x2="8" y2="6" />
</svg>

<style>
  .chevron {
    width: 100%;
    height: 100%;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    fill: none;
    transform: rotate(0deg);
    transform-origin: 50% 50%;
    transition: transform 140ms ease;
  }

  .chevron.expanded {
    transform: rotate(90deg);
  }
</style>