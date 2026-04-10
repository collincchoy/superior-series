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
