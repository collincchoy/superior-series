<script lang="ts">
  import { tick } from "svelte";
  import type { EventDieFace, ProgressCardName } from "../../lib/catan/types.js";
  import { parseLogLineSegments } from "../../lib/catan/logParsing.js";
  import {
    TRACK_BADGE_COLOR,
    PROGRESS_CARD_INFO,
    getProgressCardByName,
    EVENT_COLORS,
    EVENT_LABELS,
    eventDieIcon,
    eventDieTextColor,
  } from "../../lib/catan/constants.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import Die from "./Die.svelte";
  import DeltaChip from "./DeltaChip.svelte";

  let { log }: { log: string[] } = $props();

  let isExpanded = $state(false);
  let isPill = $state(false);
  let scrollEl = $state<HTMLDivElement | undefined>(undefined);
  let pillTimer: ReturnType<typeof setTimeout> | undefined;

  function openCardInfo(name: ProgressCardName) {
    store.openInfoModal({ kind: "card-info", card: getProgressCardByName(name) });
  }

  function startPillTimer() {
    clearTimeout(pillTimer);
    pillTimer = setTimeout(() => { isPill = true; }, 5000);
  }

  let recentLines = $derived(log.slice(-3));
  let allLines = $derived([...log]);

  $effect(() => {
    // Pop open preview on new events and restart collapse timer
    log.length;
    if (!isExpanded) {
      isPill = false;
      startPillTimer();
    }
    return () => clearTimeout(pillTimer);
  });

  function handleOverlayClick() {
    if (isPill) {
      isPill = false;
      startPillTimer();
    } else {
      clearTimeout(pillTimer);
      isExpanded = true;
    }
  }

  $effect(() => {
    allLines.length;
    if (isExpanded && scrollEl) {
      tick().then(() => { if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight; });
    }
  });
</script>

{#if !isExpanded}
  <button
    class="log-overlay"
    onclick={handleOverlayClick}
    aria-label="Show event log"
    type="button"
  >
    <div class="overlay-header">
      <span class="recent-label">Recent</span>
      <span class="expand-arrow">▲</span>
    </div>
    {#if !isPill}
    {#each recentLines as line}
      <div class="overlay-row">
        {#each parseLogLineSegments(line) as segment}
          {#if segment.type === "text"}
            <span class="seg-text">{segment.value}</span>
          {:else if segment.type === "card"}
            <span class="seg-card" style="color:{TRACK_BADGE_COLOR[getProgressCardByName(segment.name).track]}">
              {PROGRESS_CARD_INFO[segment.name].title}
            </span>
          {:else if segment.type === "delta"}
            <DeltaChip kind={segment.kind} amount={segment.amount} compact={true} />
          {:else if segment.type === "die"}
            <Die color={segment.color} value={segment.value} size="0.85rem" />
          {:else}
            <span class="seg-event" style="color:{EVENT_COLORS[segment.face]}">{eventDieIcon(segment.face)} {EVENT_LABELS[segment.face]}</span>
          {/if}
        {/each}
      </div>
    {/each}
    {/if}
  </button>
{:else}
  <div class="log-drawer" role="dialog" aria-label="Event log">
    <div class="drawer-header">
      <span class="drawer-title">Event Log</span>
      <button class="close-btn" onclick={() => { isExpanded = false; isPill = true; }} type="button" aria-label="Close event log">&times;</button>
    </div>
    <div class="drawer-content" bind:this={scrollEl}>
      {#each allLines as line}
        <div class="drawer-row">
          {#each parseLogLineSegments(line) as segment}
            {#if segment.type === "text"}
              <span>{segment.value}</span>
            {:else if segment.type === "card"}
              <button
                class="card-link"
                type="button"
                style="color:{TRACK_BADGE_COLOR[getProgressCardByName(segment.name).track]}"
                onclick={() => openCardInfo(segment.name)}
              >
                {PROGRESS_CARD_INFO[segment.name].title}
              </button>
            {:else if segment.type === "delta"}
              <DeltaChip kind={segment.kind} amount={segment.amount} compact={true} />
            {:else if segment.type === "die"}
              <span class="dice-pack">
                <Die color={segment.color} value={segment.value} size="0.95rem" />
                <span class="die-val">{segment.value}</span>
              </span>
            {:else}
              <span
                class="event-die"
                style="background:{EVENT_COLORS[segment.face]};color:{eventDieTextColor(segment.face)}"
                aria-label={EVENT_LABELS[segment.face]}
              >{eventDieIcon(segment.face)}</span>
              <span class="event-lbl" style="color:{EVENT_COLORS[segment.face]}">{EVENT_LABELS[segment.face]}</span>
            {/if}
          {/each}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  /* ── collapsed overlay ── */
  .log-overlay {
    position: absolute;
    bottom: 8px;
    left: 8px;
    z-index: 10;
    max-width: 210px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.62);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 6px 8px 5px;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    text-align: left;
    font: inherit;
    color: inherit;
  }

  .log-overlay:hover {
    background: rgba(0, 0, 0, 0.72);
    border-color: rgba(255, 255, 255, 0.18);
  }

  .overlay-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 3px;
  }

  .recent-label {
    font-size: 8px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.4);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .expand-arrow {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.3);
  }

  .overlay-row {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 2px;
    padding: 2px 0;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.75);
    line-height: 1.3;
    overflow: hidden;
    max-width: 100%;
  }

  .seg-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .seg-card {
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .seg-event {
    font-weight: 600;
    font-size: 9px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* ── expanded drawer ── */
  .log-drawer {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 65%;
    background: #1a2a1a;
    border-top: 2px solid #2c5f2e;
    display: flex;
    flex-direction: column;
    z-index: 90;
    animation: fadeUp 0.22s ease;
    box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.6);
  }

  .drawer-header {
    padding: 9px 12px;
    border-bottom: 1px solid #2c5f2e;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .drawer-title {
    font-size: 13px;
    font-weight: 700;
    color: #ddeedd;
    letter-spacing: 0.04em;
  }

  .close-btn {
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 999px;
    width: 2rem;
    height: 2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    color: #f0e8d0;
    font-size: 1.15rem;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    flex-shrink: 0;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .drawer-content {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
    font-size: 0.7rem;
    color: #a0b0a0;
  }

  .drawer-row {
    padding: 5px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.2rem;
    line-height: 1.4;
  }

  .card-link {
    border: 0;
    background: transparent;
    padding: 0;
    margin: 0;
    font: inherit;
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }

  .card-link:hover {
    filter: brightness(1.15);
  }

  .dice-pack {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
  }

  .die-val {
    font-weight: 700;
    color: #d8dfcb;
    font-size: 0.68rem;
  }

  .event-die {
    width: 0.95rem;
    height: 0.95rem;
    border-radius: 4px;
    border: 1px solid rgba(0, 0, 0, 0.45);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.68rem;
    line-height: 1;
  }

  .event-lbl {
    font-weight: 700;
    font-size: 0.65rem;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
