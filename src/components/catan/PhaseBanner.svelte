<script lang="ts">
  import type { GameState, PlayerId } from "../../lib/catan/types.js";
  import { isPlayerActing } from "../../lib/catan/turnActors.js";
  import { phaseLabel } from "./phaseLabel.js";

  let { gameState, localPid }: { gameState: GameState; localPid: PlayerId } =
    $props();

  const TRACK_STEPS = [1, 2, 3, 4, 5, 6, 7] as const;

  let isMyTurn = $derived(isPlayerActing(gameState, localPid));
  let label = $derived(phaseLabel(gameState, localPid));
  let pulseState = $state<"advance" | "reset" | null>(null);
  let lastPos = $state<number | null>(null);

  function threatLevel(position: number): "calm" | "warning" | "danger" {
    if (position >= 6) return "danger";
    if (position >= 3) return "warning";
    return "calm";
  }

  function statusLabel(position: number, robberActive: boolean): string {
    const threat = threatLevel(position);
    const robberText = robberActive ? "Robber active." : "Robber inactive.";
    return `Barbarians ${position} of 7. Threat ${threat}. ${robberText}`;
  }

  $effect(() => {
    const nextPos = gameState.barbarian.position;
    const prevPos = lastPos;
    lastPos = nextPos;
    if (prevPos === null || nextPos === prevPos) return;

    pulseState = nextPos === 0 && prevPos >= 6 ? "reset" : "advance";
    const timer = setTimeout(() => {
      pulseState = null;
    }, 600);

    return () => clearTimeout(timer);
  });
</script>

<div class="phase-banner{isMyTurn ? ' my-turn' : ''}">
  <span class="phase-label">{label}</span>
  <div
    class="barbarian-indicator {threatLevel(gameState.barbarian.position)} {pulseState ? `pulse-${pulseState}` : ''}"
    aria-label={statusLabel(
      gameState.barbarian.position,
      gameState.barbarian.robberActive,
    )}
    title={statusLabel(gameState.barbarian.position, gameState.barbarian.robberActive)}
  >
    <span class="barbarian-count">⛵ {gameState.barbarian.position}/7</span>
    <span class="barbarian-track" aria-hidden="true">
      {#each TRACK_STEPS as step}
        <span
          class="barbarian-step {gameState.barbarian.position >= step ? 'filled' : ''} {gameState.barbarian.position === step ? 'current' : ''}"
        ></span>
      {/each}
    </span>
  </div>
</div>

<style>
  .phase-banner {
    background: #2c3e2c;
    padding: 0.32rem 0.65rem;
    font-size: 0.8rem;
    color: #c8b47a;
    border-bottom: 1px solid #2c5f2e;
    transition: background 300ms ease, color 300ms ease;
    font-family: var(--font-display, cursive);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .phase-label {
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .barbarian-indicator {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 0.32rem;
    padding: 0.14rem 0.34rem;
    border-radius: 999px;
    border: 1px solid rgba(122, 143, 160, 0.65);
    background: rgba(13, 24, 36, 0.3);
    transition: border-color 180ms ease, background 180ms ease;
  }

  .barbarian-count {
    font-size: 0.66rem;
    font-weight: 700;
    color: #d6e3ee;
    letter-spacing: 0.01em;
    line-height: 1;
    white-space: nowrap;
  }

  .barbarian-track {
    display: inline-flex;
    gap: 0.11rem;
  }

  .barbarian-step {
    width: 0.23rem;
    height: 0.4rem;
    border-radius: 2px;
    background: rgba(214, 227, 238, 0.2);
    border: 1px solid rgba(214, 227, 238, 0.12);
    transition: transform 150ms ease, background 150ms ease, border-color 150ms ease;
  }

  .barbarian-step.filled {
    background: rgba(183, 219, 245, 0.9);
    border-color: rgba(214, 238, 255, 0.8);
  }

  .barbarian-step.current {
    transform: translateY(-1px);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.2);
  }

  .barbarian-indicator.warning {
    border-color: rgba(241, 194, 50, 0.75);
    background: rgba(44, 37, 6, 0.45);
  }

  .barbarian-indicator.warning .barbarian-count {
    color: #f7dd8b;
  }

  .barbarian-indicator.warning .barbarian-step.filled {
    background: rgba(241, 194, 50, 0.9);
    border-color: rgba(255, 232, 153, 0.85);
  }

  .barbarian-indicator.danger {
    border-color: rgba(231, 76, 60, 0.8);
    background: rgba(60, 20, 20, 0.45);
  }

  .barbarian-indicator.danger .barbarian-count {
    color: #ffd0c7;
  }

  .barbarian-indicator.danger .barbarian-step.filled {
    background: rgba(231, 76, 60, 0.92);
    border-color: rgba(255, 196, 186, 0.9);
  }

  .barbarian-indicator.pulse-advance {
    animation: barbarian-pulse 600ms ease;
  }

  .barbarian-indicator.pulse-reset {
    animation: barbarian-reset 600ms ease;
  }

  .phase-banner.my-turn {
    background: linear-gradient(90deg, #3a5e1e 0%, #4a6e2e 50%, #3a5e1e 100%);
    background-size: 200% 100%;
    color: #f5c842;
    font-weight: 600;
    animation: shimmer 3s ease-in-out infinite;
  }

  @keyframes barbarian-pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
  }

  @keyframes barbarian-reset {
    0% { transform: scale(1); }
    30% { transform: scale(0.96); }
    65% { transform: scale(1.08); }
    100% { transform: scale(1); }
  }

  @media (max-width: 420px) {
    .barbarian-track {
      display: none;
    }
  }

  @keyframes shimmer {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }

  @media (prefers-reduced-motion: reduce) {
    .phase-banner.my-turn { animation: none; }
    .phase-banner { transition: none; }
    .barbarian-indicator.pulse-advance,
    .barbarian-indicator.pulse-reset,
    .barbarian-step {
      animation: none;
      transition: none;
    }
  }
</style>
