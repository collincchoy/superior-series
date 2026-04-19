<script lang="ts">
  import { store } from "../../lib/catan/store.svelte.js";
  import StartView from "./StartView.svelte";
  import LobbyView from "./LobbyView.svelte";
  import GameView from "./GameView.svelte";
  import Toast from "./Toast.svelte";
</script>

<div class="catan-app">
  {#if store.screen === "start"}
    <StartView />
  {:else if store.screen === "lobby"}
    <LobbyView />
  {:else if store.screen === "game" && store.gameState && store.localPid}
    <GameView
      gameState={store.gameState}
      localPid={store.localPid}
      pendingAction={store.pendingAction}
      roomCode={store.roomCode}
    />
  {/if}
</div>

<Toast />

<style>
  .catan-app {
    height: 100%;
    overflow: auto;
  }

  /* Scrollbars: Firefox + WebKit for root and any nested scroll containers */
  .catan-app,
  .catan-app :global(*) {
    scrollbar-width: thin;
    scrollbar-color: rgba(171, 193, 168, 0.45) rgba(255, 255, 255, 0.05);
  }

  .catan-app::-webkit-scrollbar,
  .catan-app :global(*::-webkit-scrollbar) {
    width: 6px;
    height: 6px;
  }

  .catan-app::-webkit-scrollbar-track,
  .catan-app :global(*::-webkit-scrollbar-track) {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 999px;
  }

  .catan-app::-webkit-scrollbar-thumb,
  .catan-app :global(*::-webkit-scrollbar-thumb) {
    background: linear-gradient(
      180deg,
      rgba(195, 212, 188, 0.7),
      rgba(146, 166, 142, 0.72)
    );
    border-radius: 999px;
    border: 1px solid rgba(14, 20, 14, 0.45);
  }

  .catan-app::-webkit-scrollbar-thumb:hover,
  .catan-app :global(*::-webkit-scrollbar-thumb:hover) {
    background: linear-gradient(
      180deg,
      rgba(212, 226, 205, 0.85),
      rgba(162, 182, 156, 0.84)
    );
  }
</style>
