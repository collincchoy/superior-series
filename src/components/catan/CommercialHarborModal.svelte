<script lang="ts">
  import type { CommodityType, GameState, PlayerId } from "../../lib/catan/types.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import { CARD_EMOJI } from "./cardEmoji.js";
  import Modal from "./Modal.svelte";

  let { gameState, localPid }: { gameState: GameState; localPid: PlayerId } = $props();

  let pending = $derived(gameState.pendingCommercialHarbor);
  let open = $derived(!!pending?.remainingPids.includes(localPid));
  let initiatorName = $derived(pending ? (gameState.players[pending.initiatorPid]?.name ?? pending.initiatorPid) : "");
  let offeredResource = $derived(pending?.offeredResource ?? "grain");
  let me = $derived(gameState.players[localPid]!);

  const COMMODITIES: CommodityType[] = ["cloth", "coin", "paper"];

  function respond(commodity?: CommodityType) {
    store.sendAction({
      type: "PROGRESS_RESPOND_COMMERCIAL_HARBOR",
      pid: localPid,
      commodity,
    });
  }
</script>

{#if open && pending}
  <Modal {open} title="Commercial Harbor">
    <p class="msg">
      {CARD_EMOJI[offeredResource] ?? ""} <strong>{initiatorName}</strong> offers you 1 <strong>{offeredResource}</strong>.
      Give 1 commodity in return, or decline.
    </p>
    <div class="buttons">
      {#each COMMODITIES as c}
        {#if (me.resources[c] ?? 0) > 0}
          <button class="give-btn" onclick={() => respond(c)}>
            {CARD_EMOJI[c]} Give {c}
          </button>
        {/if}
      {/each}
      <button class="decline-btn" onclick={() => respond(undefined)}>Decline</button>
    </div>
  </Modal>
{/if}

<style>
  .msg {
    font-size: 0.88rem;
    color: #d6d8cd;
    margin: 0 0 0.8rem;
    line-height: 1.4;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .give-btn {
    background: #3a5e1e;
    color: #f5c842;
    border: 1px solid #6dbf6d;
    border-radius: 7px;
    padding: 0.4rem 0.75rem;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
  }
  .decline-btn {
    background: #4a2020;
    color: #f0b0b0;
    border: 1px solid #903030;
    border-radius: 7px;
    padding: 0.4rem 0.75rem;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
  }
</style>
