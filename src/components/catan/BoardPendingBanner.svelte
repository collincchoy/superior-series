<script lang="ts">
  import type { PlayerId } from "../../lib/catan/types.js";
  import type { BoardPendingBannerModel } from "../../lib/catan/boardPendingUi.js";
  import { store } from "../../lib/catan/store.svelte.js";

  let {
    model,
    localPid,
  }: {
    model: BoardPendingBannerModel;
    localPid: PlayerId;
  } = $props();

  function onSkip() {
    const s = model.skip;
    if (!s) return;
    switch (s) {
      case "free_roads":
        store.sendAction({ type: "PROGRESS_SKIP_FREE_ROADS", pid: localPid });
        break;
      case "promotions":
        store.sendAction({
          type: "PROGRESS_SKIP_FREE_PROMOTIONS",
          pid: localPid,
        });
        break;
      case "treason":
        store.sendAction({ type: "PROGRESS_SKIP_TREASON", pid: localPid });
        break;
      case "admin_cancel":
        store.setPendingAdminAction(null);
        store.setMasterControlOpen(true);
        break;
    }
  }
</script>

<div class="board-pending-banner">
  <span class="msg">{model.message}</span>
  {#if model.skip}
    <button type="button" class="skip-btn" onclick={onSkip}>
      {model.skip === "admin_cancel" ? "Cancel" : "Skip"}
    </button>
  {/if}
</div>

<style>
  /* Inline in SidePanel — must not use position:fixed or it covers Roll Dice / actions */
  .board-pending-banner {
    flex-shrink: 0;
    width: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.65rem;
    flex-wrap: wrap;
    padding: 0.5rem 0.65rem;
    background: linear-gradient(
      180deg,
      rgba(12, 22, 14, 0.92),
      rgba(18, 32, 22, 0.96)
    );
    border-top: 1px solid rgba(109, 191, 109, 0.35);
    border-bottom: 1px solid rgba(109, 191, 109, 0.22);
    font-size: 0.82rem;
    color: #e8e4d4;
  }

  .msg {
    text-align: center;
    line-height: 1.35;
    max-width: min(46rem, 100%);
  }

  .skip-btn {
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 6px;
    padding: 0.28rem 0.65rem;
    font-size: 0.78rem;
    font-weight: 600;
    color: #f5c842;
    cursor: pointer;
  }

  .skip-btn:hover {
    background: rgba(255, 255, 255, 0.16);
  }
</style>
