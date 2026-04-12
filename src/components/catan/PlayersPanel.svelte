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
</script>

<div class="players-bar">
  {#each gameState.playerOrder as pid}
    {@const p = gameState.players[pid]!}
    {@const vp = computeVP(gameState, pid)}
    {@const cards = totalCards(p.resources)}
    {@const progressCards = [...p.progressCards].sort(
      (a, b) => TRACK_SORT_ORDER[a.track] - TRACK_SORT_ORDER[b.track],
    )}
    <div
      class="player-card{pid === gameState.currentPlayerId ? ' active' : ''}"
      style="border-top: 3px solid {p.color}"
    >
      <span class="name">{p.name}{p.isBot ? " 🤖" : ""}</span>
      <span class="vp">{vp} VP</span>
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
      <div>
        <span class="cards">{cards} 🃏</span>
        {#if progressCards.length}
          <div class="pips-row" aria-label="Progress cards by color">
            {#each progressCards as c}
              <span
                class="pip"
                style={`background:${TRACK_COLORS[c.track]}`}
                title={c.track}
              ></span>
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
    padding: 0.4rem 0.5rem;
    opacity: 0.55;
    gap: 0.1rem;
  }
  .player-card.active {
    opacity: 1;
    background: rgba(255, 255, 255, 0.06);
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
    font-size: 1rem;
    font-weight: 700;
    color: #f5c842;
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

  .pips-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 2px;
    min-height: 8px;
    margin-top: 0.05rem;
  }

  .pip {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    border: 1px solid rgba(0, 0, 0, 0.35);
    display: inline-block;
  }
</style>
