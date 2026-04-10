<script lang="ts">
  import { store } from '../../lib/catan/store.svelte.js';
  import { PLAYER_COLORS } from '../../lib/catan/constants.js';
  import QRModal from './QRModal.svelte';

  let totalSlots = $derived(1 + store.pendingHumans.length + store.bots.length);
  let canAddBot = $derived(totalSlots < 4);
  let canStart = $derived(totalSlots >= 2);
  let showQR = $state(false);

  function copyCode() {
    if (store.roomCode) navigator.clipboard.writeText(store.roomCode).then(() => {});
  }
</script>

<div class="lobby">
  <h1>Catan: Cities &amp; Knights</h1>
  <div class="lobby-section">
    <h2>Room Code</h2>
    <div class="room-code-display">
      <span class="room-code-value">{store.roomCode}</span>
      <button class="btn-secondary" onclick={copyCode}>Copy</button>
      <button class="btn-secondary" onclick={() => showQR = true}>QR Code</button>
    </div>
    <p class="join-hint">Share this code so others can join</p>
  </div>
  <div class="lobby-section">
    <h2>Players ({totalSlots}/4)</h2>
    <div class="waiting-player-list">
      <div class="waiting-player-row">
        <span class="slot-color" style="background:{PLAYER_COLORS[0]}"></span>
        <span class="waiting-player-name">{store.hostName} (You)</span>
      </div>
      {#each store.pendingHumans as name, i}
        <div class="waiting-player-row">
          <span class="slot-color" style="background:{PLAYER_COLORS[1 + i] ?? '#999'}"></span>
          <span class="waiting-player-name">{name} ⏳</span>
        </div>
      {/each}
      {#each store.bots as bot, i}
        {@const colorIdx = 1 + store.pendingHumans.length + i}
        <div class="waiting-player-row">
          <span class="slot-color" style="background:{PLAYER_COLORS[colorIdx] ?? '#999'}"></span>
          <span class="waiting-player-name">{bot.name} (Bot)</span>
          <button class="btn-remove" onclick={() => store.removeBot(i)}>✕</button>
        </div>
      {/each}
    </div>
    {#if canAddBot}
      <button class="btn-secondary" onclick={() => store.addBot()}>+ Add Bot</button>
    {/if}
  </div>
  <button class="btn-primary btn-large" onclick={() => store.startGame()} disabled={!canStart}>Start Game</button>
</div>

{#if store.roomCode && showQR}
  <QRModal roomCode={store.roomCode} bind:open={showQR} />
{/if}
