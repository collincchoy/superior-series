<script lang="ts">
  import Modal from "./Modal.svelte";
  import { store } from "../../lib/catan/store.svelte.js";
  import { PROGRESS_CARD_INFO } from "../../lib/catan/constants.js";
  import ProgressCardInfoView from "./ProgressCardInfoView.svelte";
  import ProgressCardPlayView from "./ProgressCardPlayView.svelte";
  import BuildCostsView from "./BuildCostsView.svelte";
  import KnightLevelsView from "./KnightLevelsView.svelte";

  let modal = $derived(store.infoModal);
  let open = $state(false);

  $effect(() => {
    open = modal !== null;
  });

  $effect(() => {
    if (modal && !open) close();
  });

  function close() {
    store.closeInfoModal();
  }

  let title = $derived(
    !modal
      ? "Info"
      : modal.kind === "progress" || modal.kind === "card-info"
        ? PROGRESS_CARD_INFO[modal.card.name].title
        : modal.kind === "build-costs"
          ? "Build Costs"
          : "Knight Levels",
  );
</script>

{#if modal}
  <Modal bind:open={open} {title} closeOnBackdrop>
    {#if modal.kind === "progress"}
      <ProgressCardInfoView card={modal.card} helperText="" />
      <ProgressCardPlayView
        card={modal.card}
        canPlayNow={modal.canPlayNow}
        helperText={modal.helperText}
        onClose={close}
      />
    {:else if modal.kind === "card-info"}
      <ProgressCardInfoView card={modal.card} helperText="" />
    {:else if modal.kind === "build-costs"}
      <BuildCostsView />
    {:else}
      <KnightLevelsView />
    {/if}
  </Modal>
{/if}
