<script lang="ts">
  import type { GameState, PlayerId } from '../../lib/catan/types.js';
  import { computeVP } from '../../lib/catan/game.js';
  import { totalCards } from './cardEmoji.js';

  let { gameState, localPid }: { gameState: GameState; localPid: PlayerId } = $props();
</script>

<div class="players-panel">
  {#each gameState.playerOrder as pid}
    {@const p = gameState.players[pid]!}
    {@const vp = computeVP(gameState, pid)}
    {@const cards = totalCards(p.resources)}
    <div class="player-row{pid === gameState.currentPlayerId ? ' active' : ''}" style="border-left:4px solid {p.color}">
      <span class="player-name">{p.name}{p.isBot ? ' 🤖' : ''}</span>
      <span class="player-vp">{vp} VP</span>
      <span class="player-cards">{cards}🃏</span>
    </div>
  {/each}
</div>
