<script lang="ts">
  import type { GameState, PlayerId } from '../../lib/catan/types.js';
  import { phaseLabel } from './phaseLabel.js';

  let { gameState, localPid }: { gameState: GameState; localPid: PlayerId } = $props();

  let isMyTurn = $derived(gameState.currentPlayerId === localPid);
  let label = $derived(phaseLabel(gameState, localPid));
</script>

<div class="phase-banner{isMyTurn ? ' my-turn' : ''}">{label}</div>
