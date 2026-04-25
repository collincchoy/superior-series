<script lang="ts">
  let {
    vp,
    color,
    onDone,
  }: {
    vp: number;
    color: string;
    onDone: () => void;
  } = $props();

  $effect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="milestone-wrap" role="status" aria-live="polite" onclick={onDone}>
  <div class="milestone-card" style="--player-color: {color}">
    <div class="trophy">🏆</div>
    <div class="vp-number">{vp} <span class="vp-label">VP</span></div>
    <div class="milestone-text">Milestone reached!</div>
  </div>
</div>

<style>
  .milestone-wrap {
    position: fixed;
    inset: 0;
    z-index: 160;
    pointer-events: none;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 28vh;
  }

  .milestone-card {
    pointer-events: auto;
    cursor: pointer;
    background: linear-gradient(160deg, #1e2e1e, #14201a);
    border: 1.5px solid var(--player-color, #f5c842);
    border-radius: 18px;
    padding: 20px 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    box-shadow:
      0 0 32px color-mix(in srgb, var(--player-color, #f5c842) 40%, transparent),
      0 8px 32px rgba(0, 0, 0, 0.7);
    animation: milestoneIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .trophy {
    font-size: 2.4rem;
    animation: trophyFloat 1.6s ease-in-out infinite;
    line-height: 1;
  }

  .vp-number {
    font-size: 2.8rem;
    font-weight: 900;
    color: var(--player-color, #f5c842);
    line-height: 1;
    text-shadow: 0 0 20px color-mix(in srgb, var(--player-color, #f5c842) 60%, transparent);
  }

  .vp-label {
    font-size: 1.4rem;
    font-weight: 700;
    opacity: 0.8;
  }

  .milestone-text {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--player-color, #f5c842) 70%, white);
    opacity: 0.85;
  }

  @keyframes milestoneIn {
    0% { opacity: 0; transform: scale(0.5) translateY(-20px); }
    70% { opacity: 1; transform: scale(1.06) translateY(4px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }

  @keyframes trophyFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-5px); }
  }

  @media (prefers-reduced-motion: reduce) {
    .milestone-card { animation: none; }
    .trophy { animation: none; }
  }
</style>
