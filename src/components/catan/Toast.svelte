<script lang="ts">
  import { store } from '../../lib/catan/store.svelte.js';
</script>

{#if store.toast}
  <div class="toast {store.toast.kind}">{store.toast.msg}</div>
{/if}
