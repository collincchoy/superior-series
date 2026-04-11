<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    open = $bindable(),
    title,
    closeOnBackdrop = false,
    children,
  }: {
    open: boolean;
    title: string;
    closeOnBackdrop?: boolean;
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
    if (open && !dialog?.open) open = false;
  }

  function handleClick(e: MouseEvent) {
    if (closeOnBackdrop && e.target === dialog) open = false;
  }
</script>

<dialog bind:this={dialog} onclick={handleClick} onclose={syncOpenState} oncancel={syncOpenState}>
  <h3>{title}</h3>
  {@render children()}
</dialog>

<style>
  dialog {
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
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.75);
  }

  h3 {
    margin: 0 0 1rem;
    color: #f5c842;
    font-size: 1rem;
  }
</style>
