<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    open = $bindable(),
    title,
    closeOnBackdrop = true,
    closeable = true,
    size = "default",
    children,
  }: {
    open: boolean;
    title: string;
    closeOnBackdrop?: boolean;
    closeable?: boolean;
    /** default ~360px; wide for dense panels */
    size?: "default" | "wide";
    children: Snippet;
  } = $props();

  let dialog = $state<HTMLDialogElement>();

  $effect(() => {
    if (open) {
      if (dialog && !dialog.open) dialog.showModal();
    } else {
      if (dialog?.open) dialog.close();
    }
  });

  function syncOpenState() {
    if (!dialog?.open) open = false;
  }

  function handleCancel(e: Event) {
    if (!closeable) { e.preventDefault(); return; }
    open = false;
  }

  function handleClick(e: MouseEvent) {
    if (closeable && closeOnBackdrop && e.target === dialog) open = false;
  }
</script>

<dialog bind:this={dialog} class={size === "wide" ? "size-wide" : undefined} onclick={handleClick} onclose={syncOpenState} oncancel={handleCancel}>
  <div class="title-row">
    <h3>{title}</h3>
    {#if closeable}
      <button class="close-btn" type="button" aria-label="Close modal" onclick={() => (open = false)}>
        <span aria-hidden="true">&times;</span>
      </button>
    {/if}
  </div>
  {@render children()}
</dialog>

<style>
  dialog {
    position: fixed;
    margin: auto;
    background: #1e2e1e;
    border: 2px solid #2c5f2e;
    border-radius: 10px;
    padding: 1.2rem;
    max-width: 360px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    color: #f0e8d0;
    font-family: system-ui, sans-serif;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    animation: modal-in 250ms cubic-bezier(0.34, 1.3, 0.64, 1) forwards;
  }

  dialog.size-wide {
    max-width: min(720px, 94vw);
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.75);
    animation: backdrop-in 200ms ease-out forwards;
  }

  @keyframes modal-in {
    from {
      opacity: 0;
      transform: scale(0.92) translateY(8px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  @keyframes backdrop-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  h3 {
    margin: 0;
    color: #f5c842;
    font-size: 1rem;
    font-family: var(--font-display, cursive);
  }

  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    margin: 0 0 1rem;
  }

  .close-btn {
    background: transparent;
    color: #f0e8d0;
    border: 1px solid transparent;
    border-radius: 999px;
    width: 2rem;
    height: 2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    font-size: 1.15rem;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.28);
  }

  .close-btn:focus-visible {
    background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.28);
    outline: none;
  }

  @media (prefers-reduced-motion: reduce) {
    dialog { animation: none; }
    dialog::backdrop { animation: none; }
  }
</style>
