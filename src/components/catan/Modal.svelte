<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    open = $bindable(),
    title,
    closeOnBackdrop = true,
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
    if (!dialog?.open) open = false;
  }

  function handleCancel() {
    open = false;
  }

  function handleClick(e: MouseEvent) {
    if (closeOnBackdrop && e.target === dialog) open = false;
  }
</script>

<dialog bind:this={dialog} onclick={handleClick} onclose={syncOpenState} oncancel={handleCancel}>
  <div class="title-row">
    <h3>{title}</h3>
    <button class="close-btn" type="button" aria-label="Close modal" onclick={() => (open = false)}>
      <span aria-hidden="true">&times;</span>
    </button>
  </div>
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
    margin: 0;
    color: #f5c842;
    font-size: 1rem;
  }

  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    margin: 0 0 1rem;
  }

  .close-btn {
    background: rgba(255, 255, 255, 0.12);
    color: #f0e8d0;
    border: 1px solid rgba(255, 255, 255, 0.28);
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
  }
</style>
