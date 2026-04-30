<script module lang="ts">
  /** Viewport-anchored rect (e.g. from getBoundingClientRect) for vertical flip. */
  export type PopoverAnchor = {
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { tick } from "svelte";

  let {
    open = false,
    x,
    y,
    anchor = undefined,
    ariaLabel = "Close popover",
    onClose,
    children,
  }: {
    open?: boolean;
    x: number;
    y: number;
    anchor?: PopoverAnchor;
    ariaLabel?: string;
    onClose?: () => void;
    children?: Snippet;
  } = $props();

  const MARGIN = 8;
  const GAP = 6;

  let shell = $state<HTMLDivElement | undefined>();
  let posLeft = $state(0);
  let posTop = $state(0);
  let positioned = $state(false);

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

  function onWindowResize() {
    if (open) void runPosition();
  }

  async function runPosition() {
    if (!open) return;
    positioned = false;
    posLeft = x;
    posTop = y;
    await tick();
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    if (!open) return;
    if (!shell) {
      positioned = true;
      return;
    }

    const r = shell.getBoundingClientRect();
    const w = r.width;
    const h = r.height;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = x;
    let top = y;

    if (anchor) {
      if (top + h > vh - MARGIN) {
        const above = anchor.top - h - GAP;
        if (above >= MARGIN) top = above;
      }
    }

    const maxLeft = Math.max(MARGIN, vw - w - MARGIN);
    const maxTop = Math.max(MARGIN, vh - h - MARGIN);
    left = Math.min(Math.max(MARGIN, left), maxLeft);
    top = Math.min(Math.max(MARGIN, top), maxTop);

    posLeft = left;
    posTop = top;
    positioned = true;
  }

  $effect(() => {
    if (!open) {
      positioned = false;
      return;
    }
    // Subscribe to these so reposition runs when a new trigger target is chosen while open.
    void x;
    void y;
    void anchor;
    void runPosition();
  });
</script>

<svelte:window
  onkeydown={onWindowKeydown}
  onresize={onWindowResize}
/>

{#if open}
  <div
    class="popover-backdrop"
    role="button"
    tabindex="0"
    aria-label={ariaLabel}
    onclick={close}
    onkeydown={onBackdropKeydown}
  ></div>
  <div
    bind:this={shell}
    class="popover-shell"
    class:popover-pending={!positioned}
    style={`left:${posLeft}px;top:${posTop}px;`}
  >
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

  .popover-shell.popover-pending {
    visibility: hidden;
  }
</style>
