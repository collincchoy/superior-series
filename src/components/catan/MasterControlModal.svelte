<script lang="ts">
  import type {
    GameState,
    PlayerId,
    ImprovementTrack,
    ProgressCardName,
  } from "../../lib/catan/types.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import Modal from "./Modal.svelte";

  let {
    gameState,
    localPid,
    open = $bindable(false),
  }: {
    gameState: GameState;
    localPid: PlayerId;
    open: boolean;
  } = $props();

  let unsafeMode = $state(false);
  let reason = $state("");

  let moveRoadFrom = $state("");
  let moveRoadTo = $state("");
  let moveBuildingFrom = $state("");
  let moveBuildingTo = $state("");
  let moveKnightFrom = $state("");
  let moveKnightTo = $state("");

  let swapNumberA = $state("");
  let swapNumberB = $state("");
  let swapHexA = $state("");
  let swapHexB = $state("");

  let grantPid = $state("");
  let grantTrack = $state<ImprovementTrack>("science");
  let grantCardName = $state<ProgressCardName | "">("");

  let togglePid = $state("");

  let players = $derived(
    gameState.playerOrder.map((pid) => ({ pid, player: gameState.players[pid]! })),
  );
  let hexIds = $derived(Object.keys(gameState.board.hexes).sort());
  let availableCardNames = $derived(
    gameState.decks[grantTrack].map((c) => c.name),
  );

  $effect(() => {
    if (!grantPid) grantPid = localPid;
    if (!togglePid) togglePid = localPid;
  });

  $effect(() => {
    if (!availableCardNames.includes(grantCardName as ProgressCardName)) {
      grantCardName = "";
    }
  });

  function currentReason() {
    return reason.trim() || undefined;
  }

  function sendAdmin(action: any) {
    if (!store.isHostPlayer) {
      store.showToast("Master controls are host-only", "error");
      return;
    }
    store.sendAction(action);
  }

  function moveRoad() {
    if (!moveRoadFrom || !moveRoadTo) return;
    const src = gameState.board.edges[moveRoadFrom];
    if (!src) {
      store.showToast("No road found on source edge", "error");
      return;
    }
    sendAdmin({
      type: "ADMIN_MOVE_ROAD",
      pid: src.playerId,
      fromEid: moveRoadFrom,
      toEid: moveRoadTo,
      unsafe: unsafeMode,
      reason: currentReason(),
    });
  }

  function moveBuilding() {
    if (!moveBuildingFrom || !moveBuildingTo) return;
    const src = gameState.board.vertices[moveBuildingFrom];
    if (!src) {
      store.showToast("No building found on source vertex", "error");
      return;
    }
    sendAdmin({
      type: "ADMIN_MOVE_BUILDING",
      pid: src.playerId,
      fromVid: moveBuildingFrom,
      toVid: moveBuildingTo,
      unsafe: unsafeMode,
      reason: currentReason(),
    });
  }

  function moveKnight() {
    if (!moveKnightFrom || !moveKnightTo) return;
    const src = gameState.board.knights[moveKnightFrom];
    if (!src) {
      store.showToast("No knight found on source vertex", "error");
      return;
    }
    sendAdmin({
      type: "ADMIN_MOVE_KNIGHT",
      pid: src.playerId,
      fromVid: moveKnightFrom,
      toVid: moveKnightTo,
      unsafe: unsafeMode,
      reason: currentReason(),
    });
  }

  function grantProgress() {
    sendAdmin({
      type: "ADMIN_GRANT_PROGRESS_CARD",
      pid: grantPid,
      track: grantTrack,
      cardName: grantCardName || undefined,
      reason: currentReason(),
    });
  }

  function toggleBot() {
    const p = gameState.players[togglePid];
    if (!p) {
      store.showToast("Player not found", "error");
      return;
    }
    sendAdmin({
      type: "ADMIN_SET_PLAYER_BOT",
      pid: togglePid,
      isBot: !p.isBot,
      reason: currentReason(),
    });
  }

  let numberedHexIds = $derived(
    hexIds.filter((hid) => gameState.board.hexes[hid]?.number !== null),
  );
</script>

<Modal bind:open title="Wizard Panel" closeOnBackdrop={true}>
  {#snippet children()}
    <div class="wizard-shell">
      <div class="wizard-banner">
        <span class="spark">Master Mode</span>
        <span class="sub">Host-only board surgery and debug tools</span>
      </div>

      <div class="section">
        <h4>Safety</h4>
        <label class="switch-row">
          <input type="checkbox" bind:checked={unsafeMode} />
          <span>Unsafe placement bypass (for emergency repairs)</span>
        </label>
        <input
          class="text"
          placeholder="Reason for audit log (optional)"
          bind:value={reason}
        />
      </div>

      <div class="section">
        <h4>Quick Spells</h4>
        <div class="row">
          <button class="btn" onclick={() => sendAdmin({ type: "ADMIN_UNDO_LAST" })}>
            Undo Last Master Action
          </button>
          <button
            class="btn"
            onclick={() =>
              sendAdmin({ type: "END_TURN", pid: gameState.currentPlayerId })}
          >
            End Current Turn
          </button>
          <button
            class="btn danger"
            onclick={() =>
              sendAdmin({ type: "ADMIN_END_GAME", winner: null, reason: currentReason() })}
          >
            End Game
          </button>
        </div>
      </div>

      <div class="section">
        <h4>Board Surgery</h4>
        <div class="row">
          <input class="text" placeholder="Road from edge id" bind:value={moveRoadFrom} />
          <input class="text" placeholder="Road to edge id" bind:value={moveRoadTo} />
          <button class="btn" onclick={moveRoad}>Move Road</button>
        </div>
        <div class="row">
          <input class="text" placeholder="Building from vertex id" bind:value={moveBuildingFrom} />
          <input class="text" placeholder="Building to vertex id" bind:value={moveBuildingTo} />
          <button class="btn" onclick={moveBuilding}>Move Building</button>
        </div>
        <div class="row">
          <input class="text" placeholder="Knight from vertex id" bind:value={moveKnightFrom} />
          <input class="text" placeholder="Knight to vertex id" bind:value={moveKnightTo} />
          <button class="btn" onclick={moveKnight}>Move Knight</button>
        </div>
        <div class="row">
          <select bind:value={swapNumberA}>
            <option value="">Number token hex A</option>
            {#each numberedHexIds as hid}<option value={hid}>{hid}</option>{/each}
          </select>
          <select bind:value={swapNumberB}>
            <option value="">Number token hex B</option>
            {#each numberedHexIds as hid}<option value={hid}>{hid}</option>{/each}
          </select>
          <button
            class="btn"
            onclick={() =>
              swapNumberA &&
              swapNumberB &&
              sendAdmin({
                type: "ADMIN_SWAP_NUMBER_TOKENS",
                hidA: swapNumberA,
                hidB: swapNumberB,
                reason: currentReason(),
              })}
          >
            Swap Number Tokens
          </button>
        </div>
        <div class="row">
          <select bind:value={swapHexA}>
            <option value="">Hex A</option>
            {#each hexIds as hid}<option value={hid}>{hid}</option>{/each}
          </select>
          <select bind:value={swapHexB}>
            <option value="">Hex B</option>
            {#each hexIds as hid}<option value={hid}>{hid}</option>{/each}
          </select>
          <button
            class="btn"
            onclick={() =>
              swapHexA &&
              swapHexB &&
              sendAdmin({
                type: "ADMIN_SWAP_HEXES",
                hidA: swapHexA,
                hidB: swapHexB,
                reason: currentReason(),
              })}
          >
            Swap Hexes
          </button>
        </div>
      </div>

      <div class="section">
        <h4>Treasury</h4>
        <div class="row">
          <select bind:value={grantPid}>
            {#each players as { pid, player }}
              <option value={pid}>{player.name}</option>
            {/each}
          </select>
          <select bind:value={grantTrack}>
            <option value="science">Science</option>
            <option value="trade">Trade</option>
            <option value="politics">Politics</option>
          </select>
          <select bind:value={grantCardName}>
            <option value="">Top of deck</option>
            {#each availableCardNames as name}
              <option value={name}>{name}</option>
            {/each}
          </select>
          <button class="btn" onclick={grantProgress}>Grant Progress</button>
        </div>
      </div>

      <div class="section">
        <h4>Player Control</h4>
        <div class="row">
          <select bind:value={togglePid}>
            {#each players as { pid, player }}
              <option value={pid}>{player.name}</option>
            {/each}
          </select>
          <button class="btn" onclick={toggleBot}>Toggle Human/Bot</button>
        </div>
      </div>

      <div class="section">
        <h4>Inspector</h4>
        <div class="inspector-grid">
          <span>Phase</span><strong>{gameState.phase}</strong>
          <span>Current player</span><strong>{gameState.players[gameState.currentPlayerId]?.name}</strong>
          <span>Version</span><strong>{gameState.version}</strong>
          <span>Barbarians</span><strong>{gameState.barbarian.position}/7</strong>
        </div>
      </div>
    </div>
  {/snippet}
</Modal>

<style>
  .wizard-shell {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    animation: drift-in 180ms ease-out;
  }

  .wizard-banner {
    background: linear-gradient(120deg, rgba(245, 200, 66, 0.18), rgba(47, 111, 228, 0.14));
    border: 1px solid rgba(245, 200, 66, 0.45);
    border-radius: 10px;
    padding: 0.55rem 0.7rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .spark {
    color: #f5c842;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .sub {
    color: #c7d3c7;
    font-size: 0.8rem;
  }

  .section {
    border: 1px solid rgba(109, 191, 109, 0.35);
    border-radius: 10px;
    padding: 0.55rem;
    background: rgba(0, 0, 0, 0.16);
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  h4 {
    margin: 0;
    color: #f5c842;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: center;
  }

  .text,
  select {
    background: rgba(255, 255, 255, 0.08);
    color: #f0e8d0;
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 6px;
    padding: 0.35rem 0.45rem;
    font-size: 0.78rem;
    min-width: 0;
    flex: 1;
  }

  .btn {
    background: #2f6fe4;
    color: #f0e8d0;
    border: 1px solid #6ea0ff;
    border-radius: 7px;
    font-size: 0.76rem;
    font-weight: 700;
    padding: 0.34rem 0.55rem;
    cursor: pointer;
    transition: transform 120ms ease, filter 120ms ease;
  }

  .btn:hover {
    filter: brightness(1.06);
  }

  .btn:active {
    transform: scale(0.98);
  }

  .btn.danger {
    background: #7f2d2d;
    border-color: #d47d7d;
  }

  .switch-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: #d6e3d6;
  }

  .inspector-grid {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.3rem 0.6rem;
    font-size: 0.78rem;
  }

  .inspector-grid span {
    color: #9cb29c;
  }

  .inspector-grid strong {
    color: #f0e8d0;
    font-weight: 600;
  }

  @keyframes drift-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
