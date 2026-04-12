<script lang="ts">
  import type { GameState, PlayerId } from "../../lib/catan/types.js";
  import { isPlayerActing } from "../../lib/catan/turnActors.js";
  import { phaseLabel } from "./phaseLabel.js";
  import CatanPopover from "./CatanPopover.svelte";

  let { gameState, localPid }: { gameState: GameState; localPid: PlayerId } =
    $props();

  const BARBARIAN_MAX = 7;
  const TRACK_STEPS = [1, 2, 3, 4, 5, 6, 7] as const;

  let isMyTurn = $derived(isPlayerActing(gameState, localPid));
  let label = $derived(phaseLabel(gameState, localPid));
  let pulseState = $state<"advance" | "reset" | null>(null);
  let lastPos = $state<number | null>(null);
  let numericPopover = $state<{ x: number; y: number } | null>(null);

  function threatLevel(position: number): "calm" | "warning" | "danger" {
    if (position >= 6) return "danger";
    if (position >= 3) return "warning";
    return "calm";
  }

  function isNearLanding(position: number): boolean {
    return position >= BARBARIAN_MAX - 2 && position < BARBARIAN_MAX;
  }

  function statusLabel(position: number, robberActive: boolean): string {
    const threat = threatLevel(position);
    const robberText = robberActive ? "Robber active." : "Robber inactive.";
    return `Barbarians ${position} of ${BARBARIAN_MAX}. Threat ${threat}. ${robberText}`;
  }

  function closeNumericPopover() {
    numericPopover = null;
  }

  function toggleNumericPopover(event: MouseEvent | KeyboardEvent) {
    const trigger = event.currentTarget as Element | null;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const width = 64;
    const x = Math.max(
      8,
      Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8),
    );
    const y = rect.bottom + 8;

    if (numericPopover && Math.abs(numericPopover.x - x) < 1 && Math.abs(numericPopover.y - y) < 1) {
      numericPopover = null;
      return;
    }

    numericPopover = { x, y };
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
  <button
    type="button"
    class="barbarian-indicator {threatLevel(gameState.barbarian.position)} {isNearLanding(gameState.barbarian.position) ? 'near-landing' : ''} {pulseState ? `pulse-${pulseState}` : ''}"
    aria-label={statusLabel(
      gameState.barbarian.position,
      gameState.barbarian.robberActive,
    )}
    title={statusLabel(gameState.barbarian.position, gameState.barbarian.robberActive)}
    onclick={toggleNumericPopover}
  >
    <span class="barbarian-ship" aria-hidden="true">⛵</span>
    <span class="barbarian-gauge" aria-hidden="true">
      {#each TRACK_STEPS as step}
        <span
          class="barbarian-step step-{step} {gameState.barbarian.position >= step ? 'filled' : ''}"
        ></span>
      {/each}
    </span>
  </button>

  <CatanPopover
    open={!!numericPopover}
    x={numericPopover?.x ?? 0}
    y={numericPopover?.y ?? 0}
    ariaLabel="Close barbarian progress"
    onClose={closeNumericPopover}
  >
    {#if numericPopover}
      <div class="barbarian-popover">{gameState.barbarian.position}/{BARBARIAN_MAX}</div>
    {/if}
  </CatanPopover>
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
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    border: 0;
    cursor: pointer;
    padding: 0.14rem 0.34rem;
    border-radius: 999px;
    border: 1px solid rgba(122, 143, 160, 0.65);
    background: rgba(13, 24, 36, 0.3);
    transition: border-color 180ms ease, background 180ms ease;
  }

  .barbarian-indicator.near-landing::after {
    content: "";
    position: absolute;
    inset: -3px;
    border-radius: inherit;
    border: 1.5px solid rgba(242, 155, 53, 0.72);
    box-shadow: 0 0 0 0 rgba(242, 155, 53, 0.32);
    pointer-events: none;
    animation: near-landing-ring 1.6s ease-in-out infinite;
  }

  .barbarian-indicator.near-landing.danger::after {
    border-color: rgba(231, 76, 60, 0.76);
    box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.34);
  }

  .barbarian-indicator:focus-visible {
    outline: 2px solid #f5c842;
    outline-offset: 2px;
  }

  .barbarian-ship {
    font-size: 0.72rem;
    line-height: 1;
    transform: translateY(-1px);
  }

  .barbarian-gauge {
    width: 5rem;
    height: 0.5rem;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 1px;
    border-radius: 999px;
    overflow: hidden;
    background: rgba(7, 14, 22, 0.48);
    border: 1px solid rgba(214, 227, 238, 0.16);
  }

  .barbarian-step {
    height: 100%;
    background: rgba(214, 227, 238, 0.2);
    transition: background 180ms ease;
  }

  .barbarian-step.filled.step-1 {
    background: rgba(246, 249, 252, 0.96);
  }

  .barbarian-step.filled.step-2 {
    background: rgba(235, 232, 214, 0.95);
  }

  .barbarian-step.filled.step-3 {
    background: rgba(241, 194, 50, 0.92);
  }

  .barbarian-step.filled.step-4 {
    background: rgba(242, 155, 53, 0.92);
  }

  .barbarian-step.filled.step-5 {
    background: rgba(233, 112, 66, 0.93);
  }

  .barbarian-step.filled.step-6 {
    background: rgba(231, 92, 66, 0.94);
  }

  .barbarian-step.filled.step-7 {
    background: rgba(231, 76, 60, 0.95);
  }

  .barbarian-indicator.warning {
    border-color: rgba(241, 194, 50, 0.75);
    background: rgba(44, 37, 6, 0.45);
  }

  .barbarian-indicator.danger {
    border-color: rgba(231, 76, 60, 0.8);
    background: rgba(60, 20, 20, 0.45);
  }

  .barbarian-indicator.warning .barbarian-step.filled.step-4 {
    box-shadow: inset 0 0 0 1px rgba(255, 232, 153, 0.5);
  }

  .barbarian-indicator.danger .barbarian-step.filled.step-7 {
    box-shadow: inset 0 0 0 1px rgba(255, 196, 186, 0.55);
  }

  .barbarian-popover {
    min-width: 64px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: #1a2a1a;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.65);
    padding: 0.38rem 0.46rem;
    text-align: center;
    font-size: 0.8rem;
    font-weight: 700;
    color: #f5c842;
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

  @keyframes near-landing-ring {
    0%, 100% {
      opacity: 0.5;
      box-shadow: 0 0 0 0 rgba(242, 155, 53, 0.24);
    }
    50% {
      opacity: 0.95;
      box-shadow: 0 0 10px 2px rgba(242, 155, 53, 0.36);
    }
  }

  @media (max-width: 420px) {
    .barbarian-gauge {
      width: 4rem;
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

    .barbarian-indicator.near-landing::after {
      animation: none;
      opacity: 0.85;
      box-shadow: 0 0 8px 1px rgba(242, 155, 53, 0.32);
    }
  }
</style>
