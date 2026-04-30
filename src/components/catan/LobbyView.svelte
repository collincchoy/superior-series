<script lang="ts">
  import { onDestroy } from "svelte";
  import { createCopiedFlash } from "../../lib/copiedFlash.js";
  import { copyToClipboard } from "../../lib/copyToClipboard.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import { PLAYER_COLORS } from "../../lib/catan/constants.js";
  import type { BoardPreset } from "../../lib/catan/game.js";
  import QRModal from "./QRModal.svelte";
  import CopyRoomCode from "./CopyRoomCode.svelte";

  let isHost = $derived(store.isHostPlayer);
  let totalSlots = $derived(1 + store.pendingHumans.length + store.bots.length);
  let canAddBot = $derived(totalSlots < 4);
  let canStart = $derived(totalSlots >= 2);
  let showQR = $state(false);
  let codeCopied = $state(false);
  const copiedRoomCode = createCopiedFlash((v) => (codeCopied = v), onDestroy);

  function copyRoomCode() {
    if (!store.roomCode) return;
    void copyToClipboard(store.roomCode).then(() => copiedRoomCode.flash());
  }

  function getBoardPreset() {
    return store.boardPreset;
  }

  function setBoardPreset(preset: BoardPreset) {
    store.setBoardPreset(preset);
  }

  function formatEventTime(at: number) {
    return new Date(at).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  }
</script>

<div class="lobby">
  <h1>Catan: Cities &amp; Knights</h1>
  <p class="flavor-text">Gather your friends, the island awaits…</p>
  <div class="lobby-section">
    <h2>📜 Room Code</h2>
    <div class="room-code-display">
      <div
        class="room-code-value"
        class:copied={codeCopied}
        role="button"
        tabindex="0"
        aria-label="Room code {store.roomCode}, click to copy"
        onclick={copyRoomCode}
        onkeydown={(e) => e.key === 'Enter' && copyRoomCode()}
      >
        <span class="room-code-text">{store.roomCode}</span>
        <span class="room-code-overlay" aria-hidden="true">
          {codeCopied ? '✓ Copied!' : 'Copy code'}
        </span>
      </div>
      {#if store.roomCode}
        <CopyRoomCode roomCode={store.roomCode} />
      {/if}
      <button class="btn-secondary" onclick={() => (showQR = true)}>QR Code</button>
    </div>
    <p class="join-hint">Share this code so others can join ✨</p>
  </div>
  <div class="lobby-section">
    <h2>🎮 Players ({totalSlots}/4)</h2>
    <div class="waiting-player-list">
      <div class="waiting-player-row">
        <span class="slot-color" style="background:{PLAYER_COLORS[0]}"></span>
        <span class="waiting-player-name">
          {store.hostName}
          {#if isHost}(You){/if}
        </span>
      </div>
      {#each store.pendingHumans as name, i}
        <div class="waiting-player-row">
          <span class="slot-color" style="background:{PLAYER_COLORS[1 + i] ?? '#999'}"></span>
          <span class="waiting-player-name">
            {name}
            {#if !isHost && name === store.joiningName}(You){:else}⏳{/if}
          </span>
        </div>
      {/each}
      {#each store.bots as bot, i}
        {@const colorIdx = 1 + store.pendingHumans.length + i}
        <div class="waiting-player-row">
          <span class="slot-color" style="background:{PLAYER_COLORS[colorIdx] ?? '#999'}"></span>
          <span class="waiting-player-name">{bot.name} (Bot)</span>
          {#if isHost}
            <button class="btn-remove" onclick={() => store.removeBot(i)}>✕</button>
          {/if}
        </div>
      {/each}
    </div>
    {#if isHost && canAddBot}
      <button class="btn-secondary" onclick={() => store.addBot()}>+ Add Bot</button>
    {/if}
    {#if !isHost}
      <p class="waiting-hint">Waiting for the host to start the game…</p>
    {/if}
  </div>
  {#if isHost && store.lobbyConnectionEvents.length > 0}
    <div class="lobby-section">
      <h2>Connection Activity</h2>
      <div class="connection-events">
        {#each store.lobbyConnectionEvents as event (event.id)}
          <div class="connection-event {event.status}">
            <span class="event-name">{event.name}</span>
            <span class="event-detail">{event.detail}</span>
            <span class="event-time">{formatEventTime(event.at)}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
  {#if isHost}
    <div class="lobby-section">
      <h2>⚙️ Game Settings</h2>
      <label class="setting-label" for="boardPreset">Board preset</label>
      <select id="boardPreset" class="setting-select" bind:value={getBoardPreset, setBoardPreset}>
        <option value="A">A (Current configuration)</option>
        <option value="random">Random</option>
      </select>
      <p class="setting-help">
        Random shuffles hex terrain, number tokens, harbor placement, and player turn order. 6 and 8 tokens will not be adjacent.
      </p>
    </div>
    <button
      class="btn-primary btn-large"
      onclick={() => store.startGame()}
      disabled={!canStart}
    >
      Start Game
    </button>
  {/if}
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
    font-family: var(--font-display, cursive);
    letter-spacing: 0.02em;
  }

  .flavor-text {
    text-align: center;
    font-size: 0.9rem;
    color: #9cb29c;
    font-style: italic;
    margin-top: -0.8rem;
  }

  .lobby h2 {
    font-size: 1rem;
    color: #c8b47a;
    margin-bottom: 0.5rem;
    margin-top: 0;
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
    transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
  }

  .btn-primary:hover {
    background: #a07a1a;
    transform: translateY(-1px);
    box-shadow: 0 3px 12px rgba(139, 105, 20, 0.4);
  }

  .btn-primary:active {
    transform: translateY(0) scale(0.97);
    box-shadow: none;
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
    transition: transform 120ms ease, background 120ms ease;
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.15);
    transform: translateY(-1px);
  }

  .btn-secondary:active {
    transform: translateY(0) scale(0.97);
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

  .setting-label {
    display: block;
    font-size: 0.86rem;
    margin-bottom: 0.35rem;
    color: #dccb9a;
  }

  .setting-select {
    width: 100%;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    padding: 0.5rem 0.6rem;
    color: #f0e8d0;
    font-size: 0.9rem;
  }

  .setting-help {
    margin: 0.55rem 0 0;
    font-size: 0.8rem;
    color: #9cb29c;
    line-height: 1.4;
  }

  .room-code-display {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.4rem;
  }

  .room-code-value {
    position: relative;
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
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
  }

  .room-code-text {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .room-code-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    font-size: 0.85rem;
    font-family: inherit;
    font-weight: 600;
    letter-spacing: 0.02em;
    opacity: 0;
    transition: opacity 120ms ease, background 120ms ease;
    background: rgba(20, 30, 22, 0.82);
    color: #c8e6c9;
  }

  .room-code-value:hover .room-code-overlay,
  .room-code-value:focus-visible .room-code-overlay {
    opacity: 1;
  }

  .room-code-value.copied .room-code-overlay {
    opacity: 1;
    background: rgba(20, 30, 22, 0.92);
    color: #81c784;
  }

  .join-hint {
    font-size: 0.8rem;
    color: #a0b0a0;
  }

  .waiting-hint {
    font-size: 0.82rem;
    color: #9cb29c;
    font-style: italic;
    margin: 0.5rem 0 0;
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

  .connection-events {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .connection-event {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.1rem 0.5rem;
    padding: 0.45rem 0.55rem;
    border-left: 3px solid #c8b47a;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
  }

  .connection-event.disconnected {
    border-left-color: #e74c3c;
  }

  .event-name {
    font-weight: 700;
    color: #f0e8d0;
  }

  .event-detail {
    grid-column: 1 / -1;
    color: #a0b0a0;
    font-size: 0.78rem;
  }

  .event-time {
    color: #8d9c8d;
    font-family: monospace;
    font-size: 0.72rem;
  }

  .slot-color {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
  }

  @media (prefers-reduced-motion: reduce) {
    .btn-primary, .btn-secondary { transition: none; }
    .btn-primary:hover, .btn-secondary:hover { transform: none; box-shadow: none; }
  }
</style>
