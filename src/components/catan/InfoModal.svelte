<script lang="ts">
  import Modal from "./Modal.svelte";
  import { store } from "../../lib/catan/store.svelte.js";
  import { PROGRESS_CARD_INFO } from "../../lib/catan/constants.js";
  import ProgressCardInfoView from "./ProgressCardInfoView.svelte";
  import ProgressCardPlayView from "./ProgressCardPlayView.svelte";
  import BuildCostsView from "./BuildCostsView.svelte";
  import KnightLevelsView from "./KnightLevelsView.svelte";
  import CityImprovementAbilityView from "./CityImprovementAbilityView.svelte";

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

  const TRACK_LABEL: Record<string, string> = {
    science: "Science",
    trade: "Trade",
    politics: "Politics",
  };

  let title = $derived(
    !modal
      ? "Info"
      : modal.kind === "progress" || modal.kind === "card-info"
        ? PROGRESS_CARD_INFO[modal.card.name].title
        : modal.kind === "build-costs"
          ? "Build Costs"
          : modal.kind === "city-improvement-ability"
            ? `${TRACK_LABEL[modal.track] ?? modal.track} — Level 3 Ability`
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
    {:else if modal.kind === "city-improvement-ability"}
      <CityImprovementAbilityView track={modal.track} />
    {:else}
      <KnightLevelsView />
    {/if}
  </Modal>
{/if}
