<script lang="ts">
  import ChevronIcon from "./ChevronIcon.svelte";
  import { tick } from "svelte";
  import { store } from "../../lib/catan/store.svelte.js";
  import {
    PROGRESS_CARD_INFO,
    TRACK_BADGE_COLOR,
    getProgressCardByName,
  } from "../../lib/catan/constants.js";
  import type { EventDieFace, ProgressCardName } from "../../lib/catan/types.js";
  import DeltaChip from "./DeltaChip.svelte";
  import { parseLogLineSegments } from "../../lib/catan/logParsing.js";

  let { log }: { log: string[] } = $props();

  let isExpanded = $state(true);
  let el = $state<HTMLDivElement | undefined>(undefined);

  const EVENT_COLORS: Record<EventDieFace, string> = {
    ship: "#7a8fa0",
    science: "#2e9e4f",
    trade: "#f1c232",
    politics: "#2f6fe4",
  };

  const EVENT_LABELS: Record<EventDieFace, string> = {
    ship: "Barbarian",
    science: "Science",
    trade: "Trade",
    politics: "Politics",
  };

  const PIP_POSITIONS: Record<number, Array<{ x: number; y: number }>> = {
    1: [{ x: 50, y: 50 }],
    2: [
      { x: 28, y: 28 },
      { x: 72, y: 72 },
    ],
    3: [
      { x: 28, y: 28 },
      { x: 50, y: 50 },
      { x: 72, y: 72 },
    ],
    4: [
      { x: 28, y: 28 },
      { x: 72, y: 28 },
      { x: 28, y: 72 },
      { x: 72, y: 72 },
    ],
    5: [
      { x: 28, y: 28 },
      { x: 72, y: 28 },
      { x: 50, y: 50 },
      { x: 28, y: 72 },
      { x: 72, y: 72 },
    ],
    6: [
      { x: 28, y: 24 },
      { x: 72, y: 24 },
      { x: 28, y: 50 },
      { x: 72, y: 50 },
      { x: 28, y: 76 },
      { x: 72, y: 76 },
    ],
  };

  function pipLayout(value: number): Array<{ x: number; y: number }> {
    return PIP_POSITIONS[value] ?? [];
  }

  function eventIcon(event: EventDieFace): string {
    return event === "ship" ? "⛵" : "🏰";
  }

  function eventTextColor(event: EventDieFace): string {
    return event === "trade" ? "#2f2400" : "#ffffff";
  }

  function openCardInfo(name: ProgressCardName) {
    store.openInfoModal({
      kind: "card-info",
      card: getProgressCardByName(name),
    });
  }

  $effect(() => {
    // access log so the effect re-runs when it changes
    log.length;
    isExpanded;
    tick().then(() => {
      if (isExpanded && el) el.scrollTop = el.scrollHeight;
    });
  });
</script>

<div class="log-panel" class:collapsed={!isExpanded}>
  <button
    class="log-header"
    type="button"
    aria-expanded={isExpanded}
    aria-controls="log-content"
    aria-label={isExpanded ? "Collapse event log" : "Expand event log"}
    onclick={() => (isExpanded = !isExpanded)}
  >
    <span class="log-title">Event Log</span>
    <span class="log-chevron" aria-hidden="true">
      <ChevronIcon expanded={isExpanded} />
    </span>
  </button>

  {#if isExpanded}
    <div id="log-content" class="log-content" bind:this={el}>
      {#each log.slice(-8) as line}
        <div class="log-line">
          {#each parseLogLineSegments(line) as segment}
            {#if segment.type === "text"}
              <span>{segment.value}</span>
            {:else if segment.type === "card"}
              <button
                class="card-link"
                type="button"
                style={`color:${TRACK_BADGE_COLOR[getProgressCardByName(segment.name).track]}`}
                onclick={() => openCardInfo(segment.name)}
              >
                {PROGRESS_CARD_INFO[segment.name].title}
              </button>
            {:else if segment.type === "delta"}
              <DeltaChip kind={segment.kind} amount={segment.amount} compact={true} />
            {:else if segment.type === "die"}
              <span class="dice-pack">
                <span
                  class={`die ${segment.color === 'yellow' ? 'die-yellow' : 'die-red'}`}
                  aria-label={`${segment.color === 'yellow' ? 'Yellow' : 'Red'} die ${segment.value}`}
                >
                  {#each pipLayout(segment.value) as pip}
                    <span class="pip" style={`left:${pip.x}%;top:${pip.y}%`}></span>
                  {/each}
                </span>
                <span class="die-value">{segment.value}</span>
              </span>
            {:else}
              <span
                class="event-die"
                style={`background:${EVENT_COLORS[segment.face]};color:${eventTextColor(segment.face)}`}
                aria-label={EVENT_LABELS[segment.face]}
                title={EVENT_LABELS[segment.face]}
              >
                {eventIcon(segment.face)}
              </span>
              <span class="event-label" style={`color:${EVENT_COLORS[segment.face]}`}
                >{EVENT_LABELS[segment.face]}</span
              >
            {/if}
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .log-panel {
    font-size: 0.7rem;
    color: #a0b0a0;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 100px;
  }

  .log-panel.collapsed {
    flex: 0 0 auto;
    min-height: 0;
  }

  .log-header {
    border: 0;
    background: transparent;
    color: inherit;
    width: 100%;
    font: inherit;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.32rem 0.65rem;
    cursor: pointer;
  }

  .log-header:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .log-header:focus-visible {
    outline: 2px solid rgba(199, 218, 188, 0.8);
    outline-offset: -1px;
  }

  .log-title {
    font-weight: 700;
    color: #d2decf;
  }

  .log-chevron {
    width: 0.8rem;
    height: 0.8rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #d9e3ef;
    opacity: 0.86;
  }

  .log-header:hover .log-chevron {
    opacity: 1;
  }

  .log-content {
    padding: 0.32rem 0.65rem;
    max-height: 7rem;
    overflow-y: auto;
    flex: 1;
    scrollbar-width: thin;
    scrollbar-color: rgba(171, 193, 168, 0.45) rgba(255, 255, 255, 0.05);
  }

  .log-content::-webkit-scrollbar {
    width: 6px;
  }

  .log-content::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 999px;
  }

  .log-content::-webkit-scrollbar-thumb {
    background: linear-gradient(
      180deg,
      rgba(195, 212, 188, 0.7),
      rgba(146, 166, 142, 0.72)
    );
    border-radius: 999px;
    border: 1px solid rgba(14, 20, 14, 0.45);
  }

  .log-content::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(
      180deg,
      rgba(212, 226, 205, 0.85),
      rgba(162, 182, 156, 0.84)
    );
  }

  .log-line {
    padding: 0.1rem 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.2rem;
  }

  .player-name {
    color: #d2decf;
  }

  .dice-pack {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
  }

  .die {
    width: 0.95rem;
    height: 0.95rem;
    border-radius: 4px;
    border: 1px solid rgba(0, 0, 0, 0.5);
    position: relative;
    display: inline-block;
    vertical-align: middle;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15);
  }

  .die-yellow {
    background: #f6d55c;
  }

  .die-red {
    background: #d9534f;
  }

  .pip {
    position: absolute;
    width: 0.17rem;
    height: 0.17rem;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    background: #111;
  }

  .die-red .pip {
    background: #fff;
  }

  .die-value,
  .sum {
    font-weight: 700;
  }

  .die-value {
    color: #d8dfcb;
    font-size: 0.68rem;
    min-width: 0.35rem;
  }

  .sum {
    color: #cdd5df;
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

  .event-label {
    font-weight: 700;
    font-size: 0.65rem;
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
</style>
