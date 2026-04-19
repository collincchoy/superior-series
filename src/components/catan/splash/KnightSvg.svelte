<g id="knight" class="knight-sprite">
  <rect x="72" y="390" width="8" height="6" fill="#3a3048" />
  <rect x="70" y="396" width="12" height="12" fill="#1a1228" />
  <rect x="72" y="398" width="8" height="3" fill="#514064" />

  <rect x="66" y="408" width="20" height="18" fill="#1a1228" />
  <rect x="68" y="412" width="16" height="4" fill="#3a3048" />

  <rect x="62" y="410" width="4" height="12" fill="#1a1228" />
  <rect x="86" y="410" width="5" height="12" fill="#1a1228" />

  <rect x="60" y="406" width="2" height="22" fill="#6d1f2d" />
  <rect x="58" y="406" width="2" height="20" fill="#4b1520" />

  <rect x="90" y="406" width="8" height="14" fill="#30263f" />
  <rect x="98" y="406" width="2" height="14" fill="#20182d" />

  <rect x="63" y="422" width="7" height="18" fill="#1a1228" />
  <rect x="72" y="422" width="7" height="18" fill="#1a1228" />
  <rect x="63" y="440" width="7" height="4" fill="#080611" />
  <rect x="72" y="440" width="7" height="4" fill="#080611" />

  <rect x="102" y="380" width="2" height="36" fill="#a89bb3" />
  <rect x="101" y="379" width="4" height="1" fill="#8a7d95" />
  <rect x="97" y="415" width="10" height="2" fill="#6a5a7a" />
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
