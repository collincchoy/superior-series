<script lang="ts">
  import type { GameState, PlayerId } from '../../lib/catan/types.js';
  import { phaseLabel } from './phaseLabel.js';

  let { gameState, localPid }: { gameState: GameState; localPid: PlayerId } = $props();

  let isMyTurn = $derived(gameState.currentPlayerId === localPid);
  let label = $derived(phaseLabel(gameState, localPid));
</script>

<div class="phase-banner{isMyTurn ? ' my-turn' : ''}">{label}</div>

<style>
  .phase-banner {
    background: #2c3e2c;
    padding: 0.5rem 0.8rem;
    font-size: 0.85rem;
    color: #c8b47a;
    border-bottom: 1px solid #2c5f2e;
  }

  .phase-banner.my-turn {
    background: #3a5e1e;
    color: #f5c842;
    font-weight: 600;
  }
</style>
