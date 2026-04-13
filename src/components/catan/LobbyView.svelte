<script lang="ts">
  import { onMount } from "svelte";
  import PixelBackground from "./lobby/PixelBackground.svelte";
  import { store } from "../../lib/catan/store.svelte.js";

  let hostNameInput = $state("Player 1");
  let joinNameInput = $state("");
  let joinCodeInput = $state("");

  // Read URL param on mount (not module scope — window doesn't exist at build time)
  onMount(() => {
    const urlRoom = new URLSearchParams(window.location.search).get("room");
    if (urlRoom) joinCodeInput = urlRoom;
  });
</script>

<div class="lobby-bg">
  <PixelBackground />
  <div class="lobby">
    <div class="lobby-content">
      <h1>Catan: Cities &amp; Knights</h1>
      <p class="flavor-text">The island awaits brave settlers…</p>
      <div class="lobby-section">
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
      <div class="lobby-section">
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
      </div>
      {#if store.lobbyStatus}
        <div class="lobby-status {store.lobbyStatusKind}">{store.lobbyStatus}</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .lobby-bg {
    position: relative;
    min-height: 100%;
    background: #06040e;
    overflow: auto;
  }

  .lobby {
    position: relative;
    z-index: 1;
    min-height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
  }

  .lobby-content {
    width: min(100%, 520px);
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }

  .lobby h1 {
    font-size: clamp(1.5rem, 4vw, 2rem);
    color: #f5c842;
    text-align: center;
    font-family: var(--font-display, cursive);
    letter-spacing: 0.03em;
    text-shadow: 2px 2px 0 rgba(16, 12, 30, 0.95);
  }

  .flavor-text {
    text-align: center;
    font-size: 0.95rem;
    color: #bdd1bd;
    font-style: italic;
    margin-top: -0.3rem;
    margin-bottom: 0.2rem;
    text-shadow: 1px 1px 0 rgba(10, 10, 10, 0.7);
  }

  .lobby h2 {
    font-size: 1.02rem;
    color: #c8b47a;
    margin-bottom: 0.7rem;
    margin-top: 0;
    text-shadow: 1px 1px 0 #2a1f07;
  }

  .lobby-section {
    background: rgba(11, 17, 11, 0.92);
    border: 3px solid #c8b47a;
    box-shadow:
      inset 0 0 0 1px #5a420e,
      4px 4px 0 #0a0a0a;
    border-radius: 0;
    padding: 1rem;
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

  .lobby-status {
    text-align: center;
    font-size: 0.9rem;
    color: #c8b47a;
    min-height: 1.2em;
    text-shadow: 1px 1px 0 #111;
  }

  .lobby-status.error {
    color: #e74c3c;
  }

  @media (max-width: 520px) {
    .lobby {
      justify-content: flex-start;
      padding-top: 1rem;
    }

    .btn-primary {
      width: 100%;
    }
  }
</style>
