<g id="moon">
  <circle cx="95" cy="88" r="46" fill="#f8f0d0" opacity="0.95" />
  <circle class="moon-glow" cx="95" cy="88" r="56" fill="#fffde0" filter="url(#moonGlow)" opacity="0.35" />
</g>

<g id="dragon" opacity="0.9">
  <g class="wing-left">
    <polygon points="176,118 128,98 96,78 106,108 134,130 172,134" fill="#0a0814" />
    <polygon points="138,112 112,96 120,116" fill="#1b162b" opacity="0.5" />
  </g>

  <g class="wing-right">
    <polygon points="188,120 238,104 276,90 260,122 236,142 196,138" fill="#0a0814" />
    <polygon points="224,116 250,104 242,124" fill="#1b162b" opacity="0.5" />
  </g>

  <polygon points="170,132 194,128 218,138 214,150 190,154 166,146" fill="#0a0814" />
  <polygon points="214,150 232,146 246,152 232,160 214,158" fill="#0a0814" />
  <rect x="242" y="152" width="10" height="3" fill="#0a0814" />

  <rect x="164" y="144" width="4" height="16" fill="#0a0814" />
  <rect x="170" y="150" width="4" height="14" fill="#0a0814" />

  <rect x="199" y="140" width="4" height="2" fill="#f5f1ff" opacity="0.4" />
</g>

<style>
  .moon-glow {
    animation: moon-pulse 4s ease-in-out infinite;
  }

  .wing-left,
  .wing-right {
    transform-box: fill-box;
    transform-origin: center;
  }

  .wing-left {
    animation: wing-left-flap 1.8s ease-in-out infinite alternate;
  }

  .wing-right {
    animation: wing-right-flap 1.8s ease-in-out infinite alternate;
  }

  @keyframes moon-pulse {
    0% {
      opacity: 0.28;
    }

    50% {
      opacity: 0.6;
    }

    100% {
      opacity: 0.28;
    }
  }

  @keyframes wing-left-flap {
    from {
      transform: rotate(-5deg) translateY(0);
    }

    to {
      transform: rotate(-15deg) translateY(-2px);
    }
  }

  @keyframes wing-right-flap {
    from {
      transform: rotate(5deg) translateY(0);
    }

    to {
      transform: rotate(15deg) translateY(-2px);
    }
  }
</style>
