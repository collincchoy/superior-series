<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from '../../lib/catan/store.svelte.js';

  let hostNameInput = $state('Player 1');
  let joinNameInput = $state('');
  let joinCodeInput = $state('');

  // Read URL param on mount (not module scope — window doesn't exist at build time)
  onMount(() => {
    const urlRoom = new URLSearchParams(window.location.search).get('room');
    if (urlRoom) joinCodeInput = urlRoom;
  });
</script>

<div class="lobby">
  <h1>Catan: Cities &amp; Knights</h1>
  <div class="lobby-section">
    <h2>Host a new game</h2>
    <div class="join-row">
      <input type="text" placeholder="Your name" maxlength="16" bind:value={hostNameInput} />
      <button class="btn-primary" onclick={() => store.hostGame(hostNameInput)}>Host Game</button>
    </div>
  </div>
  <div class="lobby-section">
    <h2>Join existing game</h2>
    <div class="join-row">
      <input type="text" placeholder="Your name" maxlength="16" bind:value={joinNameInput} />
      <input type="text" placeholder="Room code" maxlength="36" bind:value={joinCodeInput} />
      <button class="btn-primary" onclick={() => store.joinGame(joinNameInput || 'Guest', joinCodeInput)}>Join</button>
    </div>
  </div>
  {#if store.lobbyStatus}
    <div class="lobby-status {store.lobbyStatusKind}">{store.lobbyStatus}</div>
  {/if}
</div>

<style>
  .lobby {
    max-width: 480px;
    margin: 0 auto;
    padding: 1.5rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .lobby h1 {
    font-size: 1.6rem;
    color: #f5c842;
    text-align: center;
  }

  .lobby h2 {
    font-size: 1rem;
    color: #c8b47a;
    margin-bottom: 0.5rem;
  }

  .lobby-section {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 1rem;
  }

  .join-row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .join-row input {
    flex: 1;
    min-width: 100px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    padding: 0.5rem 0.6rem;
    color: #f0e8d0;
    font-size: 0.9rem;
  }

  .btn-primary {
    background: #8b6914;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 0.6rem 1.2rem;
    font-size: 0.95rem;
    cursor: pointer;
    font-weight: 600;
  }

  .btn-primary:hover {
    background: #a07a1a;
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .lobby-status {
    text-align: center;
    font-size: 0.9rem;
    color: #c8b47a;
    min-height: 1.2em;
  }

  .lobby-status.error {
    color: #e74c3c;
  }
</style>
