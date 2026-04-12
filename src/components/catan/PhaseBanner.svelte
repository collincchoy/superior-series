<script lang="ts">
  import type { GameState, PlayerId } from "../../lib/catan/types.js";
  import { isPlayerActing } from "../../lib/catan/turnActors.js";
  import { phaseLabel } from "./phaseLabel.js";

  let { gameState, localPid }: { gameState: GameState; localPid: PlayerId } =
    $props();

  let isMyTurn = $derived(isPlayerActing(gameState, localPid));
  let label = $derived(phaseLabel(gameState, localPid));
</script>

<div class="phase-banner{isMyTurn ? ' my-turn' : ''}">{label}</div>

<style>
  .phase-banner {
    background: #2c3e2c;
    padding: 0.38rem 0.65rem;
    font-size: 0.8rem;
    color: #c8b47a;
    border-bottom: 1px solid #2c5f2e;
    transition: background 300ms ease, color 300ms ease;
    font-family: var(--font-display, cursive);
  }

  .phase-banner.my-turn {
    background: linear-gradient(90deg, #3a5e1e 0%, #4a6e2e 50%, #3a5e1e 100%);
    background-size: 200% 100%;
    color: #f5c842;
    font-weight: 600;
    animation: shimmer 3s ease-in-out infinite;
  }

  @keyframes shimmer {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }

  @media (prefers-reduced-motion: reduce) {
    .phase-banner.my-turn { animation: none; }
    .phase-banner { transition: none; }
  }
</style>
