<script lang="ts">
  import type { GameState, PlayerId } from "../../lib/catan/types.js";

  let {
    players,
    gameState,
    selected = $bindable(null),
  }: {
    players: PlayerId[];
    gameState: GameState;
    selected: PlayerId | null;
  } = $props();
</script>

<div class="player-selector">
  {#each players as pid}
    {@const player = gameState.players[pid]}
    {#if player}
      <button
        type="button"
        class="player-chip"
        class:selected={selected === pid}
        style="--player-color: {player.color}"
        onclick={() => (selected = pid)}
      >
        <span class="color-dot"></span>
        {player.name}
      </button>
    {/if}
  {/each}
</div>

<style>
  .player-selector {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-top: 0.6rem;
  }

  .player-chip {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.6rem;
    border-radius: 20px;
    border: 2px solid rgba(255, 255, 255, 0.15);
    background: #1a2a1a;
    color: #f0e8d0;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s, box-shadow 0.12s;
  }

  .player-chip:hover {
    border-color: rgba(255, 255, 255, 0.35);
    background: #223322;
  }

  .player-chip.selected {
    border-color: var(--player-color);
    background: #223322;
    box-shadow: 0 0 0 1px var(--player-color);
  }

  .color-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--player-color);
    flex-shrink: 0;
  }
</style>
