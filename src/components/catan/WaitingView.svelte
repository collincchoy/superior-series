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

  .btn-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: #f0e8d0;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  .btn-large {
    width: 100%;
    padding: 0.9rem;
    font-size: 1.1rem;
  }

  .btn-remove {
    background: none;
    border: none;
    color: #e74c3c;
    cursor: pointer;
    font-size: 1rem;
    padding: 0.2rem;
  }

  .room-code-display {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.4rem;
  }

  .room-code-value {
    font-family: monospace;
    font-size: 1.3rem;
    font-weight: 700;
    color: #f5c842;
    letter-spacing: 0.05em;
    background: rgba(255, 255, 255, 0.08);
    padding: 0.3rem 0.7rem;
    border-radius: 6px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .join-hint {
    font-size: 0.8rem;
    color: #a0b0a0;
  }

  .waiting-player-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-bottom: 0.5rem;
  }

  .waiting-player-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0;
  }

  .waiting-player-name {
    flex: 1;
    font-size: 0.9rem;
  }

  .slot-color {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    flex-shrink: 0;
  }
</style>
