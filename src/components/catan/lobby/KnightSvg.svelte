<g id="knight" class="knight-sprite">
  <rect x="72" y="334" width="8" height="6" fill="#3a3048" />
  <rect x="70" y="340" width="12" height="12" fill="#1a1228" />
  <rect x="72" y="342" width="8" height="3" fill="#514064" />

  <rect x="66" y="352" width="20" height="18" fill="#1a1228" />
  <rect x="68" y="356" width="16" height="4" fill="#3a3048" />

  <rect x="62" y="354" width="4" height="12" fill="#1a1228" />
  <rect x="86" y="354" width="5" height="12" fill="#1a1228" />

  <rect x="60" y="350" width="2" height="22" fill="#6d1f2d" />
  <rect x="58" y="350" width="2" height="20" fill="#4b1520" />

  <rect x="90" y="350" width="8" height="14" fill="#30263f" />
  <rect x="98" y="350" width="2" height="14" fill="#20182d" />

  <rect x="63" y="366" width="7" height="18" fill="#1a1228" />
  <rect x="72" y="366" width="7" height="18" fill="#1a1228" />
  <rect x="63" y="384" width="7" height="4" fill="#080611" />
  <rect x="72" y="384" width="7" height="4" fill="#080611" />

  <rect x="101" y="324" width="3" height="36" fill="#d8d3e2" />
  <rect x="100" y="322" width="5" height="3" fill="#f5f1ff" />
  <rect x="100" y="360" width="5" height="3" fill="#9a8cb5" />
</g>

<style>
  .knight-sprite {
    transform-box: fill-box;
    transform-origin: center;
    animation: knight-breathe 3s ease-in-out infinite alternate;
  }

  @keyframes knight-breathe {
    from {
      transform: translateY(0);
    }

    to {
      transform: translateY(-1px);
    }
  }
</style>
