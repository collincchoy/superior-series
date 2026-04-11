<script lang="ts">
  import { store } from '../../lib/catan/store.svelte.js';
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
  }

  .toast.error {
    background: #7a1e1e;
  }
</style>
