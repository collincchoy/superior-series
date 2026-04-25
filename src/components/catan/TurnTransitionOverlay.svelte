<script lang="ts">
  let {
    name,
    color,
    onDone,
  }: {
    name: string;
    color: string;
    onDone: () => void;
  } = $props();

  $effect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  });
</script>

<div class="transition-overlay" onclick={onDone} role="presentation">
  <div class="content">
    <div class="player-orb" style="background:{color};box-shadow:0 0 30px {color}88,0 0 60px {color}33"></div>
    <div class="now-playing-label">Now Playing</div>
    <div class="player-name">{name}</div>
    <div class="subtitle">Roll the dice to begin</div>
  </div>
</div>

<style>
  .transition-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.88);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.35s ease;
    cursor: pointer;
  }

  .content {
    text-align: center;
    animation: popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .player-orb {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    margin: 0 auto 16px;
    animation: float 2s ease-in-out infinite;
  }

  .now-playing-label {
    font-size: 11px;
    color: #6a8a6a;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    margin-bottom: 8px;
  }

  .player-name {
    font-size: 2.4rem;
    font-weight: 900;
    color: #ddeedd;
    margin-bottom: 8px;
    line-height: 1.1;
  }

  .subtitle {
    font-size: 12px;
    color: #6a8a6a;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes popIn {
    0% { transform: scale(0.4) rotate(-10deg); opacity: 0; }
    70% { transform: scale(1.08) rotate(1deg); opacity: 1; }
    100% { transform: scale(1) rotate(0deg); opacity: 1; }
  }

  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
  }

  @media (prefers-reduced-motion: reduce) {
    .transition-overlay { animation: none; }
    .content { animation: none; }
    .player-orb { animation: none; }
  }
</style>
