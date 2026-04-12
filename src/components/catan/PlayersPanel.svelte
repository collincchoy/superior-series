<script lang="ts">
  import type {
    GameState,
    ImprovementTrack,
    PlayerId,
  } from "../../lib/catan/types.js";
  import { computeVP } from "../../lib/catan/game.js";
  import { totalCards } from "./cardEmoji.js";

  let { gameState, localPid }: { gameState: GameState; localPid: PlayerId } =
    $props();

  const TRACK_COLORS: Record<ImprovementTrack, string> = {
    science: "#2e9e4f",
    trade: "#f1c232",
    politics: "#2f6fe4",
  };

  const TRACK_LABEL: Record<ImprovementTrack, string> = {
    science: "🔬",
    trade: "🤝",
    politics: "⚔️",
  };

  const TRACK_SORT_ORDER: Record<ImprovementTrack, number> = {
    science: 0,
    trade: 1,
    politics: 2,
  };

  const TRACKS: ImprovementTrack[] = ["science", "trade", "politics"];

  function progressCountsByTrack(progressCards: GameState["players"][PlayerId]["progressCards"]) {
    const counts: Record<ImprovementTrack, number> = {
      science: 0,
      trade: 0,
      politics: 0,
    };

    for (const card of progressCards) {
      counts[card.track] += 1;
    }

    return (Object.entries(counts) as Array<[ImprovementTrack, number]>)
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => TRACK_SORT_ORDER[left] - TRACK_SORT_ORDER[right]);
  }

  function metropolisTracksByPlayer(gameState: GameState, pid: PlayerId): ImprovementTrack[] {
    return TRACKS.filter((track) => gameState.metropolisOwner[track] === pid);
  }
</script>

<div class="players-bar">
  {#each gameState.playerOrder as pid}
    {@const p = gameState.players[pid]!}
    {@const vp = computeVP(gameState, pid)}
    {@const cards = totalCards(p.resources)}
    {@const progressCounts = progressCountsByTrack(p.progressCards)}
    {@const defenderVp = p.vpTokens}
    {@const metropolisTracks = metropolisTracksByPlayer(gameState, pid)}
    <div
      class="player-card{pid === gameState.currentPlayerId ? ' active' : ''}"
      style="border-top: 3px solid {p.color};{pid === gameState.currentPlayerId ? `--glow-color: ${p.color}` : ''}"
    >
      <span class="name">{p.name}{p.isBot ? " 🤖" : ""}</span>
      <span class="vp">
        <span>{vp} VP</span>
        {#if defenderVp > 0}
          <span class="vp-indicator">{defenderVp} 🛡️</span>
        {/if}
        {#if metropolisTracks.length > 0}
          <span class="vp-metropolises" aria-label="Metropolis victory points">
            {#each metropolisTracks as track}
              <span
                class="progress-dot metropolis-dot"
                style={`background:${TRACK_COLORS[track]}`}
                title={`${track} metropolis`}
                aria-hidden="true"
              ></span>
            {/each}
          </span>
        {/if}
      </span>
      <div class="improvements-row">
        <span
          class:zero={p.improvements.science === 0}
          style={`color:${TRACK_COLORS.science}`}
          >{TRACK_LABEL.science}{p.improvements.science}</span
        >
        <span
          class:zero={p.improvements.trade === 0}
          style={`color:${TRACK_COLORS.trade}`}
          >{TRACK_LABEL.trade}{p.improvements.trade}</span
        >
        <span
          class:zero={p.improvements.politics === 0}
          style={`color:${TRACK_COLORS.politics}`}
          >{TRACK_LABEL.politics}{p.improvements.politics}</span
        >
      </div>
      <div class="cards-row">
        <span class="cards">{cards} 🃏</span>
        {#if progressCounts.length}
          <div class="progress-summary" aria-label="Progress cards by track">
            {#each progressCounts as [track, count]}
              <span
                class="progress-chip"
                title={`${count} ${track} progress card${count === 1 ? "" : "s"}`}
              >
                <span
                  class="progress-dot"
                  style={`background:${TRACK_COLORS[track]}`}
                  aria-hidden="true"
                ></span>
                <span>{count}</span>
              </span>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .players-bar {
    display: flex;
    background: #1a2a1a;
    border-bottom: 2px solid #2c5f2e;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .player-card {
    flex: 1;
    min-width: 108px;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.3rem 0.45rem;
    opacity: 0.55;
    gap: 0.06rem;
  }
  .player-card.active {
    opacity: 1;
    background: rgba(255, 255, 255, 0.06);
    box-shadow: inset 0 0 12px color-mix(in srgb, var(--glow-color, #f5c842) 25%, transparent);
    animation: player-glow 2.5s ease-in-out infinite;
  }

  @keyframes player-glow {
    0%, 100% {
      box-shadow: inset 0 0 12px color-mix(in srgb, var(--glow-color, #f5c842) 25%, transparent);
    }
    50% {
      box-shadow: inset 0 0 18px color-mix(in srgb, var(--glow-color, #f5c842) 40%, transparent);
    }
  }
  .name {
    font-size: 0.75rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .vp {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.24rem;
    font-size: 1rem;
    font-weight: 700;
    color: #f5c842;
  }

  .vp-indicator {
    font-size: 0.7rem;
    font-weight: 700;
    color: #f0ddb5;
    line-height: 1;
  }

  .vp-metropolises {
    display: inline-flex;
    align-items: center;
    gap: 0.14rem;
  }

  .metropolis-dot {
    width: 7px;
    height: 7px;
  }
  .cards-row {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.3rem;
    min-height: 1rem;
  }

  .cards {
    font-size: 0.7rem;
    color: #a0b0a0;
  }

  .improvements-row {
    display: inline-flex;
    gap: 0.35rem;
    font-size: 0.66rem;
    font-weight: 700;
  }

  .zero {
    opacity: 0.4;
  }

  .progress-summary {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.22rem;
  }

  .progress-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.18rem;
    font-size: 0.62rem;
    font-weight: 700;
    color: #dfe7df;
    line-height: 1;
  }

  .progress-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    border: 1px solid rgba(0, 0, 0, 0.35);
    display: inline-block;
    flex: 0 0 auto;
  }

  @media (prefers-reduced-motion: reduce) {
    .player-card.active { animation: none; }
  }
</style>
