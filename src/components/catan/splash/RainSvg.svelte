<script lang="ts">
  const drops = Array.from({ length: 40 }, (_, i) => {
    const x = (i * 17) % 320;
    const y = (i * 23) % 568;
    const duration = 0.9 + (i % 6) * 0.1;
    const delay = (i % 10) * -0.25;
    const opacity = 0.22 + (i % 5) * 0.07;
    return { x, y, duration, delay, opacity };
  });
</script>

<g id="rain" aria-hidden="true">
  {#each drops as drop (drop.x)}
    <rect
      class="rain-drop"
      x={drop.x}
      y={drop.y}
      width="1"
      height="6"
      fill="#b4d2ff"
      fill-opacity={drop.opacity}
      style={`animation-duration:${drop.duration}s;animation-delay:${drop.delay}s`}
      transform="rotate(20)"
    />
  {/each}
</g>

<polygon
  id="lightning"
  points="34,52 58,118 46,118 76,188 60,188 92,256"
  fill="#fff8e0"
  opacity="0"
/>

<style>
  .rain-drop {
    animation-name: rain-fall;
    animation-timing-function: linear;
    animation-iteration-count: infinite;
    transform-box: fill-box;
    transform-origin: center;
  }

  #lightning {
    animation: lightning-flash 8s step-end infinite;
  }

  @keyframes rain-fall {
    from {
      transform: translate(0, 0) rotate(20deg);
    }

    to {
      transform: translate(-80px, 220px) rotate(20deg);
    }
  }

  @keyframes lightning-flash {
    0%,
    58%,
    100% {
      opacity: 0;
    }

    60% {
      opacity: 0.15;
    }

    61% {
      opacity: 0.85;
    }

    62% {
      opacity: 0.28;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .rain-drop,
    #lightning {
      animation: none;
    }
  }
</style>
