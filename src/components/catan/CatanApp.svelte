<script lang="ts">
  import { store } from '../../lib/catan/store.svelte.js';
  import LobbyView from './LobbyView.svelte';
  import WaitingView from './WaitingView.svelte';
  import GameView from './GameView.svelte';
  import Toast from './Toast.svelte';
</script>

<div class="catan-app">
  {#if store.screen === 'lobby'}
    <LobbyView />
  {:else if store.screen === 'waiting'}
    <WaitingView />
  {:else if store.screen === 'game' && store.gameState && store.localPid}
    <GameView gameState={store.gameState} localPid={store.localPid} pendingAction={store.pendingAction} roomCode={store.roomCode} />
  {/if}
</div>

<Toast />

<style>
  .catan-app {
    height: 100%;
    overflow: auto;
  }
</style>
