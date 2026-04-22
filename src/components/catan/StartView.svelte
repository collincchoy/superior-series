<script lang="ts">
  import { onMount } from "svelte";
  import PixelBackground from "./splash/PixelBackground.svelte";
  import QRScanner from "./QRScanner.svelte";
  import { store } from "../../lib/catan/store.svelte.js";

  let hostNameInput = $state("Player 1");
  let joinNameInput = $state("");
  let joinCodeInput = $state("");
  let pixelBgEnabled = $state(true);
  let inviteMode = $state(false);
  let showScanner = $state(false);
  let joinNameInputEl = $state<HTMLInputElement | undefined>(undefined);

  onMount(() => {
    const urlRoom = new URLSearchParams(window.location.search).get("room");
    if (urlRoom) {
      joinCodeInput = urlRoom;
      inviteMode = true;
    }
  });

  function handleJoinKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") store.joinGame(joinNameInput || "Guest", joinCodeInput);
  }

  function handleScan(text: string) {
    let roomCode: string | null = null;
    try {
      roomCode = new URL(text).searchParams.get("room");
    } catch { /* not a URL — keep scanner open */ }
    if (!roomCode) return;

    showScanner = false;
    joinCodeInput = roomCode;
    inviteMode = true;

    if (joinNameInput.trim()) {
      store.joinGame(joinNameInput || "Guest", roomCode);
    } else {
      requestAnimationFrame(() => joinNameInputEl?.focus());
    }
  }
</script>

<div class="start-bg" class:pixel={pixelBgEnabled}>
  {#if pixelBgEnabled}<PixelBackground />{/if}
  <div class="start">
    <div class="start-content">
      <h1>Catan: Cities &amp; Knights</h1>
      {#if inviteMode}
        <div class="start-section invite-section">
          <h2>🤝 You've been invited!</h2>
          <p class="invite-room">Room: <strong>{joinCodeInput}</strong></p>
          <div class="join-row">
            <input
              type="text"
              placeholder="Your name"
              maxlength="16"
              bind:value={joinNameInput}
              bind:this={joinNameInputEl}
              onkeydown={handleJoinKeydown}
              autofocus
            />
            <button
              class="btn-primary"
              onclick={() => store.joinGame(joinNameInput || "Guest", joinCodeInput)}
              >Join Game</button
            >
          </div>
        </div>
      {:else}
        <div class="start-section">
          <h2>🏰 Host a new game</h2>
          <div class="join-row">
            <input
              type="text"
              placeholder="Your name"
              maxlength="16"
              bind:value={hostNameInput}
            />
            <button class="btn-primary" onclick={() => store.hostGame(hostNameInput)}
              >Host Game</button
            >
          </div>
        </div>
        <div class="start-section">
          <h2>🤝 Join existing game</h2>
          <div class="join-row">
            <input
              type="text"
              placeholder="Your name"
              maxlength="16"
              bind:value={joinNameInput}
            />
            <input
              type="text"
              placeholder="Room code"
              maxlength="36"
              bind:value={joinCodeInput}
            />
            <button
              class="btn-primary"
              onclick={() => store.joinGame(joinNameInput || "Guest", joinCodeInput)}
              >Join</button
            >
          </div>
          <button
            class="btn-scan-qr"
            onclick={() => (showScanner = !showScanner)}
            aria-pressed={showScanner}
          >{showScanner ? "✕ Close Scanner" : "📷 Scan QR Code"}</button>
          {#if showScanner}
            <QRScanner onScan={handleScan} />
          {/if}
        </div>
      {/if}
      {#if store.lobbyStatus}
        <div class="start-status {store.lobbyStatusKind}">{store.lobbyStatus}</div>
      {/if}
      <p class="flavor-text">The island awaits brave settlers…</p>
    </div>
  </div>
  <button
    class="bg-toggle"
    onclick={() => (pixelBgEnabled = !pixelBgEnabled)}
    title={pixelBgEnabled ? "Disable background" : "Enable background"}
  >
    {pixelBgEnabled ? "✦" : "○"}
  </button>
</div>

<style>
  .start-bg {
    position: relative;
    height: 100%;
    min-height: 100%;
    background: #1a3a1a;
    overflow: auto;
  }

  .start-bg.pixel {
    background: #06040e;
  }

  .start {
    position: relative;
    z-index: 1;
    min-height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
  }

  .start-content {
    width: min(100%, 420px);
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }

  .start h1 {
    font-size: clamp(1.5rem, 4vw, 2rem);
    color: #f5c842;
    text-align: center;
    font-family: var(--font-display, cursive);
    letter-spacing: 0.03em;
    text-shadow: 2px 2px 0 rgba(16, 12, 30, 0.95);
    margin-bottom: 1rem;
  }

  .flavor-text {
    text-align: center;
    font-size: 0.95rem;
    color: #bdd1bd;
    font-style: italic;
    margin-top: 4rem;
    text-shadow: 1px 1px 0 rgba(10, 10, 10, 0.7);
  }

  .start h2 {
    font-size: 1.02rem;
    color: #c8b47a;
    margin-bottom: 0.7rem;
    margin-top: 0;
    text-shadow: 1px 1px 0 #2a1f07;
  }

  .start-section {
    background: rgba(11, 17, 11, 0.52);
    border: 3px solid #c8b47a;
    box-shadow:
      inset 0 0 0 1px #5a420e,
      4px 4px 0 #0a0a0a;
    border-radius: 0;
    padding: 1rem;
  }

  .invite-section {
    border-color: #f5c842;
    box-shadow:
      inset 0 0 0 1px #8b6914,
      4px 4px 0 #0a0a0a;
  }

  .invite-room {
    font-size: 0.85rem;
    color: #9cb29c;
    margin: 0 0 0.75rem;
  }

  .invite-room strong {
    color: #f5c842;
    font-family: monospace;
    letter-spacing: 0.04em;
  }

  .join-row {
    display: flex;
    gap: 0.45rem;
    flex-wrap: wrap;
  }

  .join-row input {
    flex: 1;
    min-width: 120px;
    background: rgba(10, 18, 10, 0.92);
    border: 2px solid #5a6a2a;
    border-radius: 0;
    padding: 0.5rem 0.6rem;
    color: #f0e8d0;
    font-size: 0.9rem;
    outline: none;
  }

  .join-row input:focus {
    border-color: #d4c07f;
    box-shadow: 0 0 0 1px #2f2410;
  }

  .btn-primary {
    background: #8b6914;
    color: #fff7de;
    border: 2px solid #c8b47a;
    border-radius: 0;
    padding: 0.6rem 1.2rem;
    font-size: 0.95rem;
    cursor: pointer;
    font-weight: 600;
    box-shadow: 3px 3px 0 #3a2a04;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    transition: none;
  }

  .btn-primary:hover {
    background: #a07a1a;
    transform: translate(-1px, -1px);
    box-shadow: 4px 4px 0 #3a2a04;
  }

  .btn-primary:active {
    transform: translate(2px, 2px);
    box-shadow: 1px 1px 0 #3a2a04;
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: default;
  }

  @media (prefers-reduced-motion: reduce) {
    .btn-primary { transition: none; }
    .btn-primary:hover { transform: none; box-shadow: none; }
  }

  .start-status {
    text-align: center;
    font-size: 0.9rem;
    color: #c8b47a;
    min-height: 1.2em;
    text-shadow: 1px 1px 0 #111;
  }

  .start-status.error {
    color: #e74c3c;
  }

  .bg-toggle {
    position: absolute;
    z-index: 2;
    bottom: 0.75rem;
    right: 0.75rem;
    background: rgba(11, 17, 11, 0.7);
    border: 1px solid #5a420e;
    color: #c8b47a;
    font-size: 0.75rem;
    width: 1.8rem;
    height: 1.8rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.5;
    transition: opacity 0.15s;
  }

  .bg-toggle:hover {
    opacity: 1;
  }

  .btn-scan-qr {
    margin-top: 0.5rem;
    background: transparent;
    color: #c8b47a;
    border: 1px solid #5a6a2a;
    border-radius: 0;
    padding: 0.4rem 0.8rem;
    font-size: 0.82rem;
    cursor: pointer;
    letter-spacing: 0.02em;
  }

  .btn-scan-qr:hover {
    background: rgba(200, 180, 122, 0.12);
    border-color: #c8b47a;
  }

  .btn-scan-qr[aria-pressed="true"] {
    border-color: #f5c842;
    color: #f5c842;
  }

  @media (max-width: 420px) {
    .btn-primary {
      width: 100%;
    }
  }
</style>
