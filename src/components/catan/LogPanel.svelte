<script lang="ts">
  import { tick } from "svelte";
  import type { EventDieFace } from "../../lib/catan/types.js";

  let { log }: { log: string[] } = $props();

  let el: HTMLDivElement;

  const EVENT_COLORS: Record<EventDieFace, string> = {
    ship: "#1f2630",
    science: "#2f6fe4",
    trade: "#2e9e4f",
    politics: "#f1c232",
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
    return event === "politics" ? "#2f2400" : "#ffffff";
  }

  function parseRollLine(line: string): {
    player: string;
    yellow: number;
    red: number;
    sum: number;
    event: EventDieFace;
  } | null {
    const match = line.match(
      /^(.*) rolled Y([1-6]) R([1-6]) = (\d{1,2}) \((ship|science|trade|politics)\)$/,
    );
    if (!match) return null;
    return {
      player: match[1]!,
      yellow: Number(match[2]),
      red: Number(match[3]),
      sum: Number(match[4]),
      event: match[5] as EventDieFace,
    };
  }

  $effect(() => {
    // access log so the effect re-runs when it changes
    log.length;
    tick().then(() => {
      if (el) el.scrollTop = el.scrollHeight;
    });
  });
</script>

<div class="log-panel" bind:this={el}>
  {#each log.slice(-8) as line}
    {@const roll = parseRollLine(line)}
    {#if roll}
      <div class="log-line">
        <span class="player-name">{roll.player}</span>
        <span> rolled </span>
        <span class="dice-pack">
          <span class="die die-yellow" aria-label={`Yellow die ${roll.yellow}`}>
            {#each pipLayout(roll.yellow) as pip}
              <span
                class="pip"
                style={`left:${pip.x}%;top:${pip.y}%`}
              ></span>
            {/each}
          </span>
          <span class="die-value">{roll.yellow}</span>
        </span>
        <span> </span>
        <span class="dice-pack">
          <span class="die die-red" aria-label={`Red die ${roll.red}`}>
            {#each pipLayout(roll.red) as pip}
              <span
                class="pip"
                style={`left:${pip.x}%;top:${pip.y}%`}
              ></span>
            {/each}
          </span>
          <span class="die-value">{roll.red}</span>
        </span>
        <span> = </span>
        <span class="sum">{roll.sum}</span>
        <span> </span>
        <span
          class="event-die"
          style={`background:${EVENT_COLORS[roll.event]};color:${eventTextColor(roll.event)}`}
          aria-label={EVENT_LABELS[roll.event]}
          title={EVENT_LABELS[roll.event]}
        >
          {eventIcon(roll.event)}
        </span>
        <span class="event-label" style={`color:${EVENT_COLORS[roll.event]}`}
          >{EVENT_LABELS[roll.event]}</span
        >
      </div>
    {:else}
      <div class="log-line">{line}</div>
    {/if}
  {/each}
</div>

<style>
  .log-panel {
    padding: 0.4rem 0.8rem;
    font-size: 0.7rem;
    color: #a0b0a0;
    max-height: 6rem;
    overflow-y: auto;
    flex: 1;
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
</style>
