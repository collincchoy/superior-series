<script lang="ts">
  import type { GameState, PlayerId, Resources } from "../../lib/catan/types.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import { CARD_EMOJI, RESOURCE_KEYS } from "./cardEmoji.js";
  import Modal from "./Modal.svelte";
  import ResourceHandPicker from "./ResourceHandPicker.svelte";
  import ResourcePill from "./ResourcePill.svelte";

  let {
    gameState,
    localPid,
    openInitiate = $bindable(false),
  }: {
    gameState: GameState;
    localPid: PlayerId;
    openInitiate: boolean;
  } = $props();

  let pendingOffer = $derived(gameState.pendingTradeOffer);
  let isResponding = $derived(pendingOffer?.targetPids.includes(localPid) ?? false);

  // ── Initiate mode state ────────────────────────────────────────────────────
  let selectedTargetPids = $state(new Set<PlayerId>());
  let give = $state<Partial<Resources>>({});
  let want = $state<Partial<Resources>>({});

  let me = $derived(gameState.players[localPid]!);
  let otherPlayers = $derived(
    gameState.playerOrder
      .filter((pid) => pid !== localPid)
      .map((pid) => gameState.players[pid])
      .filter(Boolean),
  );

  function totalCards(r: Partial<Resources>): number {
    return Object.values(r).reduce((s, v) => s + (v ?? 0), 0);
  }

  let giveTotal = $derived(totalCards(give));
  let wantTotal = $derived(totalCards(want));
  let canSendOffer = $derived(
    selectedTargetPids.size > 0 && giveTotal > 0 && wantTotal > 0,
  );

  // ── Responder affordability ────────────────────────────────────────────────
  let canAfford = $derived.by(() => {
    if (!pendingOffer) return false;
    for (const [k, v] of Object.entries(pendingOffer.want)) {
      if ((me.resources[k as keyof Resources] ?? 0) < (v ?? 0)) return false;
    }
    return true;
  });

  // ── Reset state when modal opens — default all players selected ───────────
  $effect(() => {
    if (openInitiate) {
      selectedTargetPids = new Set(otherPlayers.map((p) => p!.id));
      give = {};
      want = {};
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function adjustGive(k: keyof Resources, dir: number) {
    const cur = give[k] ?? 0;
    const have = me.resources[k] ?? 0;
    if (dir > 0 && cur >= have) return;
    if (dir < 0 && cur <= 0) return;
    const next = cur + dir;
    if (next <= 0) {
      const { [k]: _, ...rest } = give;
      give = rest;
    } else {
      give = { ...give, [k]: next };
    }
  }

  function adjustWant(k: keyof Resources, dir: number) {
    const cur = want[k] ?? 0;
    if (dir < 0 && cur <= 0) return;
    const next = cur + dir;
    if (next <= 0) {
      const { [k]: _, ...rest } = want;
      want = rest;
    } else {
      want = { ...want, [k]: next };
    }
  }

  function toggleTarget(pid: PlayerId) {
    const next = new Set(selectedTargetPids);
    if (next.has(pid)) next.delete(pid);
    else next.add(pid);
    selectedTargetPids = next;
  }

  function sendOffer() {
    if (!canSendOffer) return;
    store.sendAction({
      type: "TRADE_OFFER",
      from: localPid,
      to: [...selectedTargetPids],
      offer: give,
      want,
    });
    openInitiate = false;
  }

  function acceptOffer() {
    if (!pendingOffer) return;
    store.sendAction({
      type: "TRADE_ACCEPT",
      from: pendingOffer.initiatorPid,
      to: localPid,
    });
  }

  function rejectOffer() {
    if (!pendingOffer) return;
    store.sendAction({
      type: "TRADE_REJECT",
      from: pendingOffer.initiatorPid,
      to: localPid,
    });
  }
</script>

{#if isResponding && pendingOffer}
  <!-- ── Response Mode ─────────────────────────────────────────────────────── -->
  <Modal open={true} title="🤝 Trade Offer!" closeable={false}>
    {@const initiator = gameState.players[pendingOffer.initiatorPid]}
    <div class="responder-body">
      <p class="offer-from">
        <span class="player-dot" style="background:{initiator?.color}"></span>
        <strong>{initiator?.name}</strong> wants to trade with you!
      </p>

      <div class="trade-summary">
        <div class="trade-side">
          <div class="pane-title">They give you:</div>
          <div class="pill-row">
            {#each RESOURCE_KEYS as k}
              {#if (pendingOffer.offer[k] ?? 0) > 0}
                <ResourcePill resource={k} count={pendingOffer.offer[k]!} />
              {/if}
            {/each}
          </div>
        </div>
        <div class="trade-arrow">⇄</div>
        <div class="trade-side">
          <div class="pane-title">You give them:</div>
          <div class="pill-row">
            {#each RESOURCE_KEYS as k}
              {#if (pendingOffer.want[k] ?? 0) > 0}
                <ResourcePill
                  resource={k}
                  count={pendingOffer.want[k]!}
                  muted={!canAfford && (me.resources[k] ?? 0) < (pendingOffer.want[k] ?? 0)}
                />
              {/if}
            {/each}
          </div>
        </div>
      </div>

      {#if !canAfford}
        <p class="afford-warn">⚠️ You don't have enough cards to accept.</p>
      {/if}

      <div class="respond-btns">
        <button class="btn-reject" onclick={rejectOffer}>✗ Decline</button>
        <button class="btn-accept" onclick={acceptOffer} disabled={!canAfford}>
          ✓ Accept
        </button>
      </div>
    </div>
  </Modal>
{:else if openInitiate}
  <!-- ── Initiate Mode ──────────────────────────────────────────────────────── -->
  <Modal bind:open={openInitiate} title="🤝 Propose a Trade" closeOnBackdrop>
    <!-- Player multi-select (default: all) -->
    <div class="section">
      <div class="field-label">Trade with:</div>
      <div class="player-row">
        {#each otherPlayers as player}
          <button
            class="player-btn"
            class:selected={selectedTargetPids.has(player!.id)}
            onclick={() => toggleTarget(player!.id)}
            style="--pc:{player!.color}"
          >
            <span class="player-dot" style="background:{player!.color}"></span>
            {player!.name}
          </button>
        {/each}
      </div>
    </div>

    <!-- 4-panel 2×2 grid -->
    <div class="trade-grid">
      <!-- Left column: resource type picker → You want -->
      <div class="grid-col">
        <div class="pane-box">
          <div class="pane-title">Ask for</div>
          <div class="type-picker">
            {#each RESOURCE_KEYS as k}
              <button
                class="type-btn"
                onclick={() => adjustWant(k, 1)}
                title="Want {k}"
                aria-label="Add {k} to want"
              >
                {CARD_EMOJI[k]}
              </button>
            {/each}
          </div>
        </div>
        <div class="pane-box">
          <div class="pane-title">You want</div>
          <div class="pill-grid">
            {#each RESOURCE_KEYS as k}
              {#if (want[k] ?? 0) > 0}
                <button
                  type="button"
                  class="pill-btn"
                  onclick={() => adjustWant(k, -1)}
                  aria-label="Remove {k}"
                >
                  <ResourcePill resource={k} count={want[k]!} />
                </button>
              {/if}
            {/each}
            {#if wantTotal === 0}
              <span class="empty">Nothing yet.</span>
            {/if}
          </div>
        </div>
      </div>

      <!-- Right column: Your offer ← Your hand (ResourceHandPicker) -->
      <div class="grid-col">
        <ResourceHandPicker
          selectedLabel="Your offer"
          handLabel="Your hand"
          selected={give}
          hand={me.resources}
          onAdjust={(k, dir) => adjustGive(k, dir)}
        />
      </div>
    </div>

    <div class="actions">
      <button class="btn-primary" onclick={sendOffer} disabled={!canSendOffer}>
        Send Offer
      </button>
    </div>
  </Modal>
{/if}

<style>
  .section {
    margin-bottom: 0.75rem;
  }

  .field-label {
    display: block;
    font-size: 0.8rem;
    color: #c8b47a;
    margin-bottom: 0.35rem;
  }

  /* ── Player picker ── */
  .player-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .player-btn {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    background: rgba(255, 255, 255, 0.08);
    color: #f0e8d0;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 20px;
    padding: 0.3rem 0.8rem;
    font-size: 0.82rem;
    cursor: pointer;
    min-height: 40px;
    transition: background 100ms ease;
  }

  .player-btn.selected {
    background: rgba(255, 255, 255, 0.15);
    border-color: var(--pc, #6dbf6d);
    box-shadow: 0 0 0 2px var(--pc, #6dbf6d);
  }

  .player-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* ── 4-panel grid ── */
  .trade-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  @media (max-width: 380px) {
    .trade-grid {
      grid-template-columns: 1fr;
    }
  }

  .grid-col {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    min-width: 0;
  }

  .pane-box {
    border: 1px solid rgba(109, 191, 109, 0.24);
    border-radius: 10px;
    padding: 0.45rem;
    background: rgba(7, 30, 10, 0.5);
  }

  .pane-title {
    font-size: 0.73rem;
    text-transform: uppercase;
    color: #c8b47a;
    margin-bottom: 0.35rem;
    letter-spacing: 0.03em;
  }

  /* ── Resource type picker (Ask for) ── */
  .type-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .type-btn {
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    padding: 0.25rem 0.35rem;
    font-size: 1.3rem;
    line-height: 1;
    cursor: pointer;
    min-height: 42px;
    min-width: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 80ms ease, transform 80ms ease;
  }

  .type-btn:hover {
    background: rgba(255, 255, 255, 0.14);
  }

  .type-btn:active {
    transform: scale(0.93);
  }

  /* ── You want pane ── */
  .pill-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    min-height: 2.4rem;
    align-content: flex-start;
  }

  .pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 10px;
    padding: 0.16rem 0.2rem;
    background: rgba(55, 20, 20, 0.3);
    cursor: pointer;
    min-height: 42px;
    transition: filter 120ms ease;
  }

  .pill-btn:hover {
    filter: brightness(1.07);
  }

  .pill-btn:active {
    transform: scale(0.98);
  }

  .empty {
    color: #a0b0a0;
    font-size: 0.8rem;
    align-self: center;
  }

  /* ── Actions ── */
  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .btn-primary {
    flex: 1;
    background: #8b6914;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 0.6rem 1.2rem;
    min-height: 44px;
    font-size: 0.95rem;
    cursor: pointer;
    font-weight: 600;
    transition: background 100ms ease;
  }

  .btn-primary:hover:not(:disabled) {
    background: #a07820;
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: default;
  }

  /* ── Responder mode ── */
  .responder-body {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  .offer-from {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.9rem;
  }

  .trade-summary {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 0.7rem;
  }

  .trade-side {
    flex: 1;
    min-width: 0;
  }

  .pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .trade-arrow {
    font-size: 1.2rem;
    color: #f5c842;
    flex-shrink: 0;
    padding-top: 1.2rem;
  }

  .afford-warn {
    margin: 0;
    font-size: 0.8rem;
    color: #e07070;
  }

  .respond-btns {
    display: flex;
    gap: 0.5rem;
  }

  .btn-reject {
    flex: 1;
    background: #5e1e1e;
    color: #f0e8d0;
    border: 1px solid #8b3030;
    border-radius: 6px;
    padding: 0.6rem 1rem;
    min-height: 44px;
    font-size: 0.9rem;
    cursor: pointer;
    font-weight: 600;
    transition: background 100ms ease;
  }

  .btn-reject:hover {
    background: #7a2424;
  }

  .btn-accept {
    flex: 1;
    background: #2a5e1e;
    color: #f0e8d0;
    border: 1px solid #4a9e3e;
    border-radius: 6px;
    padding: 0.6rem 1rem;
    min-height: 44px;
    font-size: 0.9rem;
    cursor: pointer;
    font-weight: 600;
    transition: background 100ms ease;
  }

  .btn-accept:hover:not(:disabled) {
    background: #3a7e28;
  }

  .btn-accept:disabled {
    opacity: 0.4;
    cursor: default;
  }

  @media (prefers-reduced-motion: reduce) {
    .type-btn,
    .pill-btn {
      transition: none;
    }
    .type-btn:hover,
    .type-btn:active,
    .pill-btn:hover,
    .pill-btn:active {
      filter: none;
      transform: none;
    }
  }
</style>
