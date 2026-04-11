<script lang="ts">
  import type { GameState, PlayerId } from "../../lib/catan/types.js";
  import { computeVP } from "../../lib/catan/game.js";
  import { totalCards } from "./cardEmoji.js";

  let { gameState, localPid }: { gameState: GameState; localPid: PlayerId } =
    $props();
</script>

<div class="players-bar">
  {#each gameState.playerOrder as pid}
    {@const p = gameState.players[pid]!}
    {@const vp = computeVP(gameState, pid)}
    {@const cards = totalCards(p.resources)}
    <div
      class="player-card{pid === gameState.currentPlayerId ? ' active' : ''}"
      style="border-top: 3px solid {p.color}"
    >
      <span class="name">{p.name}{p.isBot ? " 🤖" : ""}</span>
      <span class="vp">{vp} VP</span>
      <span class="cards">{cards} 🃏</span>
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
    min-width: 72px;
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
</style>
