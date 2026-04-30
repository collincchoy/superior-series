<script lang="ts">
  import type { GameState, PlayerId } from "../../lib/catan/types.js";

  let {
    mode,
    playerIds,
    gameState,
    selectedSingle = $bindable(null),
    selectedMulti = $bindable(new Set<PlayerId>()),
    isEnabled,
  }: {
    mode: "single" | "multi";
    playerIds: PlayerId[];
    gameState: GameState;
    selectedSingle?: PlayerId | null;
    selectedMulti?: Set<PlayerId>;
    /** When omitted, all listed players are selectable. */
    isEnabled?: (pid: PlayerId) => boolean;
  } = $props();

  function enabled(pid: PlayerId): boolean {
    return isEnabled ? isEnabled(pid) : true;
  }

  function toggleMulti(pid: PlayerId) {
    const next = new Set(selectedMulti);
    if (next.has(pid)) next.delete(pid);
    else next.add(pid);
    selectedMulti = next;
  }
</script>

<div class="player-chip-bar" role={mode === "multi" ? "group" : undefined}>
  {#each playerIds as pid (pid)}
    {@const player = gameState.players[pid]}
    {#if player}
      {@const on = enabled(pid)}
      {#if mode === "single"}
        <button
          type="button"
          class="player-chip"
          class:selected={selectedSingle === pid}
          class:dim={!on}
          disabled={!on}
          style="--player-color: {player.color}"
          onclick={() => (selectedSingle = pid)}
        >
          <span class="color-dot"></span>
          {player.name}
        </button>
      {:else}
        <button
          type="button"
          class="player-chip"
          class:selected={selectedMulti.has(pid)}
          class:dim={!on}
          disabled={!on}
          style="--player-color: {player.color}"
          onclick={() => toggleMulti(pid)}
        >
          <span class="color-dot"></span>
          {player.name}
        </button>
      {/if}
    {/if}
  {/each}
</div>

<style>
  .player-chip-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-top: 0.35rem;
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
    transition:
      border-color 0.12s,
      background 0.12s,
      box-shadow 0.12s;
  }

  .player-chip.dim:not(.selected) {
    opacity: 0.45;
  }

  .player-chip:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.35);
    background: #223322;
  }

  .player-chip.selected {
    border-color: var(--player-color);
    background: #223322;
    box-shadow: 0 0 0 1px var(--player-color);
  }

  .player-chip:disabled {
    cursor: not-allowed;
  }

  .color-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--player-color);
    flex-shrink: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .player-chip {
      transition: none;
    }
  }
</style>
