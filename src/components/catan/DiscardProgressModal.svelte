<script lang="ts">
  import type { GameState, PlayerId, ProgressCard } from "../../lib/catan/types.js";
  import { TRACK_BADGE_COLOR } from "../../lib/catan/constants.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import Modal from "./Modal.svelte";
  import ProgressCardInfoView from "./ProgressCardInfoView.svelte";

  let { gameState, localPid }: { gameState: GameState; localPid: PlayerId } =
    $props();

  let needed = $derived(
    gameState.pendingProgressDiscard?.remaining[localPid] ?? 0,
  );
  let open = $derived(
    gameState.phase === "DISCARD_PROGRESS" &&
      needed > 0 &&
      gameState.pendingVpCardAnnouncement?.pid !== localPid,
  );
  let me = $derived(gameState.players[localPid]!);

  let previewHandIdx = $state<number | null>(null);
  let prevOpen = $state(false);
  /** How many cards this player must discard for this modal session (baseline when it opened). */
  let sessionDiscardTotal = $state(0);

  function firstNonVpHandIndex(cards: ProgressCard[]): number | null {
    const i = cards.findIndex((c) => !c.isVP);
    return i >= 0 ? i : null;
  }

  $effect(() => {
    const o = open;
    if (o && !prevOpen) {
      sessionDiscardTotal = needed;
    }
    prevOpen = o;
    if (o) {
      previewHandIdx = firstNonVpHandIndex(me.progressCards);
    }
  });

  let discardGoal = $derived(
    sessionDiscardTotal > 0 ? sessionDiscardTotal : needed,
  );
  let discardedCount = $derived(
    open ? Math.max(0, discardGoal - needed) : 0,
  );

  let previewCard = $derived.by(() => {
    const cards = me.progressCards;
    let idx = previewHandIdx;
    if (idx !== null && cards[idx] && !cards[idx]!.isVP) {
      return cards[idx]!;
    }
    const fallback = firstNonVpHandIndex(cards);
    return fallback !== null ? cards[fallback]! : null;
  });

  let previewIdxForActions = $derived(
    previewHandIdx !== null &&
      me.progressCards[previewHandIdx] &&
      !me.progressCards[previewHandIdx]!.isVP
      ? previewHandIdx
      : null,
  );

  function onCardPreview(handIdx: number) {
    previewHandIdx = handIdx;
  }

  function discardPreviewedCard() {
    const i = previewIdxForActions;
    if (i === null) return;
    const card = me.progressCards[i];
    if (!card || card.isVP) return;
    store.sendAction({ type: "DISCARD_PROGRESS", pid: localPid, cards: [card] });
  }
</script>

<Modal
  {open}
  title={needed === 1 ? "Discard 1 progress card" : `Discard progress cards (${needed} left)`}
  closeable={false}
  closeOnBackdrop={false}
>
  <p class="hint">
    Cities & Knights: keep at most 4 non-VP progress cards. Tap a card to preview it, then discard it. If you still owe more, pick the next card and discard again.
  </p>

  <div class="card-grid">
    {#each me.progressCards as c, handIdx (handIdx)}
      {#if !c.isVP}
        <button
          type="button"
          class="prog-card"
          class:previewing={previewHandIdx === handIdx}
          style="background:{TRACK_BADGE_COLOR[c.track]}"
          onclick={() => onCardPreview(handIdx)}
        >
          {c.name}
        </button>
      {/if}
    {/each}
  </div>

  {#if previewCard}
    <div class="preview-section">
      <h3 class="preview-heading">Card details</h3>
      <div class="card-preview" aria-live="polite">
        <div class="card-preview-inner">
          <ProgressCardInfoView card={previewCard} />
        </div>
      </div>
      {#if previewIdxForActions !== null}
        <div class="preview-actions">
          <div class="tally" aria-live="polite">
            Discarded {discardedCount} / {discardGoal}
          </div>
          <button
            type="button"
            class="btn-discard"
            onclick={discardPreviewedCard}
          >
            Discard
          </button>
        </div>
      {/if}
    </div>
  {/if}
</Modal>

<style>
  .hint {
    margin: 0 0 0.65rem;
    font-size: 0.82rem;
    color: #c8b47a;
  }

  .card-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-bottom: 0.75rem;
  }

  .prog-card {
    border: 2px solid rgba(0, 0, 0, 0.35);
    border-radius: 6px;
    padding: 0.35rem 0.55rem;
    font-size: 0.78rem;
    cursor: pointer;
    color: #1a1a12;
    font-weight: 600;
  }

  .prog-card.previewing {
    outline: 2px solid #6eb5d9;
    box-shadow: 0 0 0 2px rgba(110, 181, 217, 0.45);
  }

  .preview-section {
    margin-bottom: 0.75rem;
  }

  .preview-heading {
    margin: 0 0 0.4rem;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #c8b47a;
  }

  .card-preview {
    min-height: 7rem;
    max-height: 12rem;
    border: 2px solid rgba(212, 175, 55, 0.35);
    border-radius: 8px;
    padding: 0.65rem 0.75rem;
    background: rgba(212, 175, 55, 0.06);
  }

  .card-preview-inner {
    max-height: 10.5rem;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .preview-actions {
    margin-top: 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .tally {
    font-size: 0.9rem;
    color: #c8b47a;
    text-align: center;
  }

  .btn-discard {
    width: 100%;
    min-height: 44px;
    padding: 0.7rem 1.35rem;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    border: none;
    border-radius: 6px;
    background: #8b6914;
    color: #fff;
  }

  @media (max-width: 720px) {
    .btn-discard {
      width: 100%;
    }
  }
</style>
