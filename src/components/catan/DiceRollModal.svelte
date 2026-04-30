<script lang="ts">
  import { untrack } from "svelte";
  import type { EventDieFace } from "../../lib/catan/types.js";
  import { EVENT_COLORS, EVENT_LABELS, eventDieIcon, eventDieTextColor } from "../../lib/catan/constants.js";
  import Die from "./Die.svelte";

  let {
    animationKey,
    die1,
    die2,
    eventFace,
    rollerName,
    isLocalPlayer,
    onDone,
  }: {
    /** Stable per physical roll — timers must not reset when host rebroadcasts the same `lastRoll` with new object refs. */
    animationKey: number;
    die1: number;
    die2: number;
    eventFace: EventDieFace;
    rollerName: string;
    isLocalPlayer: boolean;
    onDone: () => void;
  } = $props();

  type Phase = "shaking" | "reveal" | "done";
  const ROLL_ANIMATION_MS = 900;
  const REVEAL_MS = 500;
  const AUTO_ACKNOWLEDGE_MS = 2500;

  let phase = $state<Phase>("shaking");
  let displayD1 = $state(Math.ceil(Math.random() * 6));
  let displayD2 = $state(Math.ceil(Math.random() * 6));

  $effect(() => {
    void animationKey;
    const target1 = untrack(() => die1);
    const target2 = untrack(() => die2);

    phase = "shaking";

    const interval = setInterval(() => {
      displayD1 = Math.ceil(Math.random() * 6);
      displayD2 = Math.ceil(Math.random() * 6);
    }, 80);

    const revealTimer = setTimeout(() => {
      clearInterval(interval);
      displayD1 = target1;
      displayD2 = target2;
      phase = "reveal";
    }, ROLL_ANIMATION_MS);

    let autoAcknowledgeTimer: ReturnType<typeof setTimeout> | undefined;
    const doneTimer = setTimeout(() => {
      phase = "done";
      autoAcknowledgeTimer = setTimeout(onDone, AUTO_ACKNOWLEDGE_MS);
    }, ROLL_ANIMATION_MS + REVEAL_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(revealTimer);
      clearTimeout(doneTimer);
      if (autoAcknowledgeTimer) clearTimeout(autoAcknowledgeTimer);
    };
  });

  function handleTap() {
    if (phase === "done") onDone();
  }

  let total = $derived(die1 + die2);
  let rollLabel = $derived(
    phase === "shaking" ? "Rolling…"
    : phase === "reveal" ? "…"
    : isLocalPlayer ? "You rolled" : `${rollerName} rolled`
  );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dice-backdrop" onclick={handleTap}>
  <div class="dice-card">
    <div class="roll-label">{rollLabel}</div>

    <div class="dice-row">
      <!-- Production die 1 (yellow) -->
      <div class="die-wrap" class:shaking={phase === "shaking"} class:popping={phase === "reveal"} style="--delay:0s">
        <Die color="yellow" value={displayD1} size="3.5rem" />
      </div>

      <!-- Production die 2 (red) -->
      <div class="die-wrap" class:shaking={phase === "shaking"} class:popping={phase === "reveal"} style="--delay:0.05s">
        <Die color="red" value={displayD2} size="3.5rem" />
      </div>

      <!-- Event die -->
      <div class="die-wrap" class:shaking={phase === "shaking"} class:popping={phase === "reveal"} style="--delay:0.1s">
        <div
          class="event-die-face"
          style="background:{phase === 'shaking' ? '#444' : EVENT_COLORS[eventFace]};color:{phase === 'shaking' ? '#999' : eventDieTextColor(eventFace)}"
          aria-label={phase === "shaking" ? "Event die" : EVENT_LABELS[eventFace]}
        >
          <span class="event-icon">{phase === "shaking" ? "?" : eventDieIcon(eventFace)}</span>
        </div>
      </div>
    </div>

    {#if phase === "done"}
      <div class="result" role="status" aria-live="polite">
        <div class="total" class:total-seven={total === 7}>{total}</div>
        <div class="event-label" style="color:{EVENT_COLORS[eventFace]}">{eventDieIcon(eventFace)} {EVENT_LABELS[eventFace]}</div>
        <div class="tap-hint">TAP TO CONTINUE</div>
      </div>
    {/if}
  </div>
</div>

<style>
  .dice-backdrop {
    position: fixed;
    inset: 0;
    z-index: 150;
    background: rgba(0, 0, 0, 0.78);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s ease;
    cursor: pointer;
  }

  .dice-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    background: #1a2a1a;
    border: 1.5px solid #2c5f2e;
    border-radius: 24px;
    padding: 32px 36px;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.8);
    animation: popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    min-width: 260px;
  }

  .roll-label {
    font-size: 11px;
    color: #6a8a6a;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  .dice-row {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .die-wrap {
    width: 3.5rem;
    height: 3.5rem;
    flex-shrink: 0;
    border-radius: 6px;
    overflow: hidden;
  }

  /* Die.svelte renders as an inline span; we need it block to fill the wrap */
  .die-wrap :global(.die) {
    display: block;
    width: 100% !important;
    height: 100% !important;
    border-radius: 6px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.6);
  }

  .event-die-face {
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(0, 0, 0, 0.3);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.6);
    transition: background 0.2s, color 0.2s;
  }

  .event-icon {
    font-size: 1.5rem;
    line-height: 1;
  }

  .die-wrap.shaking {
    animation: diceShake 0.12s ease infinite;
    animation-delay: var(--delay, 0s);
  }

  .die-wrap.popping {
    animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    animation-delay: var(--delay, 0s);
    animation-fill-mode: both;
  }

  .result {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    animation: fadeUp 0.3s ease;
    text-align: center;
  }

  .total {
    font-size: 3.5rem;
    font-weight: 900;
    line-height: 1;
    color: #ddeedd;
    text-shadow: 0 0 20px rgba(200, 178, 74, 0.4);
  }

  .total.total-seven {
    color: #ff4444;
    text-shadow: 0 0 20px rgba(255, 68, 68, 0.6);
  }

  .event-label {
    font-size: 13px;
    font-weight: 600;
  }

  .tap-hint {
    margin-top: 10px;
    font-size: 10px;
    color: #6a8a6a;
    letter-spacing: 0.1em;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes popIn {
    0% { transform: scale(0.4) rotate(-10deg); opacity: 0; }
    70% { transform: scale(1.1) rotate(2deg); opacity: 1; }
    100% { transform: scale(1) rotate(0deg); opacity: 1; }
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes diceShake {
    0%, 100% { transform: rotate(0deg) scale(1); }
    20% { transform: rotate(-18deg) scale(1.08); }
    40% { transform: rotate(14deg) scale(1.05); }
    60% { transform: rotate(-10deg) scale(1.06); }
    80% { transform: rotate(8deg) scale(1.04); }
  }

  @media (prefers-reduced-motion: reduce) {
    .dice-backdrop { animation: none; }
    .dice-card { animation: none; }
    .die-wrap.shaking,
    .die-wrap.popping { animation: none; }
    .result { animation: none; }
  }
</style>
