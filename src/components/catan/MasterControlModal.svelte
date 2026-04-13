<script lang="ts">
  import type {
    GameState,
    PlayerId,
    ImprovementTrack,
    ProgressCardName,
    GameAction,
    PendingStateField,
    CardType,
  } from "../../lib/catan/types.js";
  import type { PendingAdminAction } from "../../lib/catan/validTargets.js";
  import { getActingPlayerIds } from "../../lib/catan/turnActors.js";
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

  let grantPid = $state("");
  let grantTrack = $state<ImprovementTrack>("science");
  let grantCardName = $state<ProgressCardName | "">("");
  let grantCardType = $state<CardType>("brick");
  let grantCardAmount = $state(1);

  let togglePid = $state("");

  let players = $derived(
    gameState.playerOrder.map((pid) => ({ pid, player: gameState.players[pid]! })),
  );
  let availableCardNames = $derived(
    gameState.decks[grantTrack].map((c) => c.name),
  );
  let actingPlayers = $derived(
    getActingPlayerIds(gameState).map((pid) => gameState.players[pid]?.name ?? pid),
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

  function sendAdmin(action: GameAction) {
    if (!store.isHostPlayer) {
      store.showToast("Control Panel is host-only", "error");
      return;
    }
    store.sendAction(action);
  }

  function beginBoardSelection(action: PendingAdminAction) {
    if (!store.isHostPlayer) {
      store.showToast("Control Panel is host-only", "error");
      return;
    }
    store.setPendingAdminAction(action);
    open = false;
    store.setMasterControlOpen(false);
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

  function grantCards() {
    const amount = Math.max(1, Math.floor(Number(grantCardAmount) || 1));
    sendAdmin({
      type: "ADMIN_GRANT_CARDS",
      pid: grantPid,
      cards: { [grantCardType]: amount },
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

  function clearPendingField(field: PendingStateField) {
    sendAdmin({
      type: "ADMIN_CLEAR_PENDING_STATE",
      fields: [field],
      phase: "ACTION",
      reason: currentReason(),
    });
  }

  function formatPending(value: unknown) {
    if (value === null) return "none";
    return JSON.stringify(value);
  }
</script>

<Modal bind:open title="Control Panel" closeOnBackdrop={true}>
  {#snippet children()}
    <div class="control-panel-shell">
      <p class="panel-description">Host-only recovery and debug controls. Changes are logged and can be undone.</p>

      <div class="section">
        <h4>Quick Actions</h4>
        <div class="row">
          <button class="btn" onclick={() => sendAdmin({ type: "ADMIN_UNDO_LAST" })}>
            Undo Last Action
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
        <input
          class="text"
          placeholder="Reason for audit log (optional)"
          bind:value={reason}
        />
      </div>

      <div class="section">
        <h4>Board Surgery</h4>
        <label class="switch-row">
          <input type="checkbox" bind:checked={unsafeMode} />
          <span>Unsafe movement checks (for emergency repairs)</span>
        </label>
        <div class="row">
          <button
            class="btn"
            onclick={() =>
              beginBoardSelection({
                type: "admin_move_road_pick_from",
                unsafe: unsafeMode,
                reason: currentReason(),
              })}
          >
            Move Road (select on board)
          </button>
          <button
            class="btn"
            onclick={() =>
              beginBoardSelection({
                type: "admin_move_building_pick_from",
                unsafe: unsafeMode,
                reason: currentReason(),
              })}
          >
            Move Building (select on board)
          </button>
        </div>
        <div class="row">
          <button
            class="btn"
            onclick={() =>
              beginBoardSelection({
                type: "admin_move_knight_pick_from",
                unsafe: unsafeMode,
                reason: currentReason(),
              })}
          >
            Move Knight (select on board)
          </button>
          <button
            class="btn"
            onclick={() =>
              beginBoardSelection({
                type: "admin_swap_number_pick_a",
                reason: currentReason(),
              })}
          >
            Swap Number Tokens (select on board)
          </button>
        </div>
        <div class="row">
          <button
            class="btn"
            onclick={() =>
              beginBoardSelection({
                type: "admin_swap_hex_pick_a",
                reason: currentReason(),
              })}
          >
            Swap Hexes (select on board)
          </button>
        </div>
      </div>

      <div class="section">
        <h4>Game State</h4>
        <div class="pending-grid">
          <span>pendingProgressDraw</span>
          <code>{formatPending(gameState.pendingProgressDraw)}</code>
          <button class="btn small" onclick={() => clearPendingField("pendingProgressDraw")}>Clear</button>

          <span>pendingDiscard</span>
          <code>{formatPending(gameState.pendingDiscard)}</code>
          <button class="btn small" onclick={() => clearPendingField("pendingDiscard")}>Clear</button>

          <span>pendingDisplace</span>
          <code>{formatPending(gameState.pendingDisplace)}</code>
          <button class="btn small" onclick={() => clearPendingField("pendingDisplace")}>Clear</button>

          <span>pendingFreeRoads</span>
          <code>{formatPending(gameState.pendingFreeRoads)}</code>
          <button class="btn small" onclick={() => clearPendingField("pendingFreeRoads")}>Clear</button>

          <span>pendingKnightPromotions</span>
          <code>{formatPending(gameState.pendingKnightPromotions)}</code>
          <button class="btn small" onclick={() => clearPendingField("pendingKnightPromotions")}>Clear</button>

          <span>pendingCommercialHarbor</span>
          <code>{formatPending(gameState.pendingCommercialHarbor)}</code>
          <button class="btn small" onclick={() => clearPendingField("pendingCommercialHarbor")}>Clear</button>
        </div>
      </div>

      <div class="section">
        <h4>Treasury</h4>
        <div class="treasury-grid">
          <span class="treasury-label">Player</span>
          <select bind:value={grantPid}>
            {#each players as { pid, player }}
              <option value={pid}>{player.name}</option>
            {/each}
          </select>

          <span class="treasury-label">Progress card</span>
          <div class="treasury-actions">
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

          <span class="treasury-label">Resource / commodity</span>
          <div class="treasury-actions">
            <select bind:value={grantCardType}>
              <option value="brick">Brick</option>
              <option value="lumber">Lumber</option>
              <option value="ore">Ore</option>
              <option value="grain">Grain</option>
              <option value="wool">Wool</option>
              <option value="cloth">Cloth</option>
              <option value="coin">Coin</option>
              <option value="paper">Paper</option>
            </select>
            <input
              class="text amount-input"
              type="number"
              min="1"
              step="1"
              bind:value={grantCardAmount}
            />
            <button class="btn" onclick={grantCards}>Grant Cards</button>
          </div>
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
          <span>Acting players</span><strong>{actingPlayers.join(", ") || "none"}</strong>
          <span>Version</span><strong>{gameState.version}</strong>
          <span>Barbarians</span><strong>{gameState.barbarian.position}/7</strong>
        </div>
      </div>
    </div>
  {/snippet}
</Modal>

<style>
  .control-panel-shell {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    animation: drift-in 180ms ease-out;
  }

  .panel-description {
    margin: 0;
    color: #c7d3c7;
    font-size: 0.82rem;
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

  .btn.small {
    padding: 0.2rem 0.45rem;
    font-size: 0.7rem;
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

  .pending-grid {
    display: grid;
    grid-template-columns: 1fr 1.4fr auto;
    gap: 0.3rem 0.5rem;
    align-items: center;
    font-size: 0.75rem;
  }

  .pending-grid code {
    color: #dce9dc;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 6px;
    padding: 0.15rem 0.3rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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

  .treasury-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.35rem;
  }

  .treasury-label {
    color: #9cb29c;
    font-size: 0.75rem;
  }

  .treasury-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.35rem;
  }

  .amount-input {
    width: 100%;
  }

  @media (max-width: 560px) {
    .treasury-actions {
      grid-template-columns: 1fr;
    }
  }
</style>
