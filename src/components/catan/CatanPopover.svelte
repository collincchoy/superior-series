<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    open = false,
    x,
    y,
    ariaLabel = "Close popover",
    onClose,
    children,
  }: {
    open?: boolean;
    x: number;
    y: number;
    ariaLabel?: string;
    onClose?: () => void;
    children?: Snippet;
  } = $props();

  function close() {
    onClose?.();
  }

  function onBackdropKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    close();
  }

  function onWindowKeydown(event: KeyboardEvent) {
    if (!open || event.key !== "Escape") return;
    close();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
  <div
    class="popover-backdrop"
    role="button"
    tabindex="0"
    aria-label={ariaLabel}
    onclick={close}
    onkeydown={onBackdropKeydown}
  ></div>
  <div class="popover-shell" style={`left:${x}px;top:${y}px;`}>
    {@render children?.()}
  </div>
{/if}

<style>
  .popover-backdrop {
    position: fixed;
    inset: 0;
    z-index: 300;
  }

  .popover-shell {
    position: fixed;
    z-index: 301;
  }
</style>
