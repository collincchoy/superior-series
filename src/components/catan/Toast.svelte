<script lang="ts">
  import { store } from "../../lib/catan/store.svelte.js";
</script>

{#if store.toast}
  <div class="toast {store.toast.kind}">{store.toast.msg}</div>
{/if}

<style>
  .toast {
    position: fixed;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    background: #2c5f2e;
    color: #f0e8d0;
    padding: 0.6rem 1.2rem;
    border-radius: 20px;
    font-size: 0.9rem;
    z-index: 200;
    pointer-events: none;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    animation: toast-in 350ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  .toast.error {
    background: #7a1e1e;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(12px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .toast { animation: none; }
  }
</style>
