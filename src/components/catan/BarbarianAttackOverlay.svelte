<script lang="ts">
  import type {
    GameState,
    PlayerId,
    VertexId,
  } from "../../lib/catan/types.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import { getVertexPixel } from "../../lib/catan/svgHelpers.js";
  import { onMount } from "svelte";

  let {
    gameState,
  }: {
    gameState: GameState;
  } = $props();

  const pending = $derived(gameState.pendingBarbarian);

  // ─── Step machine ──────────────────────────────────────────────────────────
  type Step =
    | "night"
    | "wobble"
    | "approach"
    | "tally"
    | "reveal"
    | "outcome"
    | "done";

  let step = $state<Step>("night");
  let citiesCounted = $state(0);
  let knightsCounted = $state(0);
  let skipped = $state(false);
  let reducedMotion = $state(false);
  const timers: number[] = [];

  // ─── Anchors: ship icon and board center ──────────────────────────────────
  // Captured once on mount via getBoundingClientRect on real DOM elements.
  let shipAnchor = $state<{ x: number; y: number } | null>(null);
  let boardCenter = $state<{ x: number; y: number } | null>(null);
  let boardBox = $state<DOMRect | null>(null);
  // Overlay SVG in client pixel space; width/height set after mount
  let overlaySize = $state<{ w: number; h: number }>({ w: 0, h: 0 });

  // Board SVG viewBox is "-420 -400 840 800"
  const BOARD_VB_X = -420;
  const BOARD_VB_Y = -400;
  const BOARD_VB_W = 840;
  const BOARD_VB_H = 800;

  /** Convert a board-SVG point (viewBox coords) into overlay client pixels. */
  function boardToScreen(px: number, py: number): { x: number; y: number } {
    const b = boardBox;
    if (!b) return { x: 0, y: 0 };
    // The board SVG uses preserveAspectRatio default (meet), so it's letterboxed.
    const scale = Math.min(b.width / BOARD_VB_W, b.height / BOARD_VB_H);
    const drawnW = BOARD_VB_W * scale;
    const drawnH = BOARD_VB_H * scale;
    const offsetX = b.left + (b.width - drawnW) / 2;
    const offsetY = b.top + (b.height - drawnH) / 2;
    return {
      x: offsetX + (px - BOARD_VB_X) * scale,
      y: offsetY + (py - BOARD_VB_Y) * scale,
    };
  }

  /** Screen coordinate of a vertex (city / knight) on the live board. */
  function vertexScreen(vid: VertexId): { x: number; y: number } | null {
    const p = getVertexPixel(vid);
    if (!p) return null;
    return boardToScreen(p.x, p.y);
  }

  // ─── Derived: cities & active knights at attack time ──────────────────────
  // NOTE: the game state hasn't been mutated yet, so we read live positions.
  type CityRef = { vid: VertexId; screen: { x: number; y: number } };
  type KnightRef = {
    vid: VertexId;
    pid: PlayerId;
    strength: 1 | 2 | 3;
    screen: { x: number; y: number };
  };

  let cityRefs = $derived.by<CityRef[]>(() => {
    const refs: CityRef[] = [];
    if (!boardBox) return refs;
    for (const [vid, b] of Object.entries(gameState.board.vertices)) {
      if (b?.type !== "city") continue;
      const s = vertexScreen(vid as VertexId);
      if (s) refs.push({ vid: vid as VertexId, screen: s });
    }
    return refs;
  });

  let knightRefs = $derived.by<KnightRef[]>(() => {
    const refs: KnightRef[] = [];
    if (!boardBox) return refs;
    for (const [vid, k] of Object.entries(gameState.board.knights)) {
      if (!k || !k.active) continue;
      const s = vertexScreen(vid as VertexId);
      if (s)
        refs.push({
          vid: vid as VertexId,
          pid: k.playerId,
          strength: k.strength as 1 | 2 | 3,
          screen: s,
        });
    }
    return refs;
  });

  // Rings to draw during the tally step, accumulated one per tick.
  let cityRingsDrawn = $state(0);
  let knightRingsDrawn = $state(0);
  type Floater = { id: number; x: number; y: number; label: string };
  let knightFloaters = $state<Floater[]>([]);

  // Fires to draw during barbarians_win outcome, one per pillaged city
  let firesLit = $state(0);

  // Late-joiner flag set on mount
  let startedMidflight = $state(false);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function schedule(ms: number, fn: () => void) {
    const id = window.setTimeout(fn, ms);
    timers.push(id);
    return id;
  }

  function cancelTimers() {
    while (timers.length) window.clearTimeout(timers.pop()!);
  }

  function resolveAnchors() {
    // Board canvas SVG
    const boardSvg = document.querySelector<SVGSVGElement>(".board-svg");
    if (boardSvg) {
      boardBox = boardSvg.getBoundingClientRect();
      overlaySize = { w: window.innerWidth, h: window.innerHeight };
      boardCenter = {
        x: boardBox.left + boardBox.width / 2,
        y: boardBox.top + boardBox.height / 2,
      };
    }
    const ship = document.querySelector<HTMLElement>(".barbarian-ship");
    if (ship) {
      const sr = ship.getBoundingClientRect();
      shipAnchor = {
        x: sr.left + sr.width / 2,
        y: sr.top + sr.height / 2,
      };
    } else if (boardCenter) {
      // Fallback: start slightly above the board center
      shipAnchor = { x: boardCenter.x, y: boardCenter.y - 200 };
    }
  }

  // ─── Cinematic steps ──────────────────────────────────────────────────────
  function playTally() {
    step = "tally";
    citiesCounted = 0;
    knightsCounted = 0;
    cityRingsDrawn = 0;
    knightRingsDrawn = 0;
    knightFloaters = [];

    const p = pending;
    if (!p) return;

    const cityTicks = Math.min(cityRefs.length, p.barbarianStrength);
    const knightTicks = knightRefs.length;
    const cityTickMs = 240;
    const knightTickMs = 240;

    let t = 0;
    // Cities one-by-one
    for (let i = 0; i < cityTicks; i++) {
      t += cityTickMs;
      schedule(t, () => {
        cityRingsDrawn = i + 1;
        citiesCounted = i + 1;
      });
    }
    // Pause, then knights one-by-one
    t += 400;
    for (let i = 0; i < knightTicks; i++) {
      t += knightTickMs;
      const k = knightRefs[i]!;
      schedule(t, () => {
        knightRingsDrawn = i + 1;
        knightsCounted = knightsCounted + k.strength;
        const id = Date.now() + i;
        knightFloaters = [
          ...knightFloaters,
          { id, x: k.screen.x, y: k.screen.y, label: `+${k.strength}` },
        ];
        // Fade floater
        schedule(1200, () => {
          knightFloaters = knightFloaters.filter((f) => f.id !== id);
        });
      });
    }
    // Jump to final totals (safety for counter mismatch) then reveal
    t += 520;
    schedule(t, () => {
      citiesCounted = p.barbarianStrength;
      knightsCounted = p.totalDefense;
    });
    t += 400;
    schedule(t, () => playReveal());
  }

  function playReveal() {
    step = "reveal";
    schedule(520, () => playOutcome());
  }

  function playOutcome() {
    step = "outcome";
    const p = pending;
    if (!p) return playDone();
    if (p.outcome === "barbarians_win") {
      // Stagger fire animations 350ms apart; each fire runs ~2000ms
      for (let i = 0; i < p.citiesPillaged.length; i++) {
        schedule(i * 350, () => {
          firesLit = i + 1;
        });
      }
      const totalFireMs =
        2000 + 350 * Math.max(0, p.citiesPillaged.length - 1);
      schedule(totalFireMs + 400, () => playDone());
    } else {
      // defenders_win or tie_draw: shield holds for ~2400ms
      schedule(2400, () => playDone());
    }
  }

  function playDone() {
    step = "done";
    // Fade out, then host commits
    schedule(520, () => {
      if (store.isHostPlayer) {
        store.sendAction({
          type: "EXECUTE_BARBARIAN_ATTACK",
          pid: gameState.currentPlayerId,
        });
      }
    });
  }

  // Skip: collapse to outcome immediately.
  function skip() {
    if (skipped || step === "done") return;
    skipped = true;
    cancelTimers();
    const p = pending;
    if (p) {
      citiesCounted = p.barbarianStrength;
      knightsCounted = p.totalDefense;
      cityRingsDrawn = cityRefs.length;
      knightRingsDrawn = knightRefs.length;
    }
    playOutcome();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      skip();
    }
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────
  onMount(() => {
    reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    resolveAnchors();
    const onResize = () => resolveAnchors();
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);

    // Late-joiner / welcome snapshot: skip intro when (a) we stayed in this
    // phase across two ticks, or (b) first store apply ever is already this
    // phase (client joined mid-attack). Do NOT treat all prevPhase === null as
    // midflight — that includes first lobby paint; gate (b) on phase.
    startedMidflight =
      store.prevPhase === "RESOLVE_BARBARIANS" ||
      (store.prevPhase === null && gameState.phase === "RESOLVE_BARBARIANS");

    if (reducedMotion) {
      step = "reveal";
      schedule(520, () => playOutcome());
    } else if (startedMidflight) {
      playTally();
    } else {
      step = "night";
      schedule(800, () => {
        // 2. Wobble
        step = "wobble";
        schedule(700, () => {
          // 3. Approach
          step = "approach";
          schedule(1200, () => playTally());
        });
      });
    }

    return () => {
      cancelTimers();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  });

  // ─── Visual helpers ───────────────────────────────────────────────────────
  let shipStyle = $derived.by(() => {
    if (!shipAnchor) return "";
    // Start at shipAnchor, slide to boardCenter on approach step
    if (
      step === "approach" ||
      step === "tally" ||
      step === "reveal" ||
      step === "outcome" ||
      step === "done"
    ) {
      if (boardCenter) {
        return `left:${shipAnchor.x}px;top:${shipAnchor.y}px;--tx:${boardCenter.x - shipAnchor.x}px;--ty:${boardCenter.y - shipAnchor.y - 80}px;`;
      }
    }
    return `left:${shipAnchor.x}px;top:${shipAnchor.y}px;--tx:0px;--ty:0px;`;
  });

  let outcomeColor = $derived.by(() => {
    if (!pending) return "#f5c842";
    if (pending.outcome === "defenders_win") return "#6dbf6d";
    if (pending.outcome === "tie_draw") return "#f5c842";
    return "#e74c3c";
  });

  let revealLabel = $derived.by(() => {
    if (!pending) return "";
    if (pending.outcome === "defenders_win") return "Defenders Hold!";
    if (pending.outcome === "tie_draw") return "Tied Defense";
    return "Barbarians Plunder!";
  });

  let vsGlyph = $derived.by(() => {
    if (!pending) return "=";
    if (pending.totalDefense > pending.barbarianStrength) return ">";
    if (pending.totalDefense < pending.barbarianStrength) return "<";
    return "=";
  });

  let heroName = $derived.by(() => {
    if (!pending || pending.vpWinners.length !== 1) return "";
    const w = pending.vpWinners[0]!;
    return gameState.players[w]?.name ?? w;
  });

  let heroColor = $derived.by(() => {
    if (!pending || pending.vpWinners.length !== 1) return "#f5c842";
    const w = pending.vpWinners[0]!;
    return gameState.players[w]?.color ?? "#f5c842";
  });

  let pillagedScreens = $derived.by(() => {
    if (!pending) return [] as Array<{ vid: VertexId; x: number; y: number }>;
    if (!boardBox) return [];
    return pending.citiesPillaged.flatMap((vid) => {
      const s = vertexScreen(vid);
      return s ? [{ vid, x: s.x, y: s.y }] : [];
    });
  });
</script>

{#if pending}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="barb-overlay"
    class:reduced={reducedMotion}
    onclick={skip}
    role="presentation"
  >
    <!-- 1. Night dim layer -->
    <div class="night" class:active={step !== "done"}></div>

    <!-- 2. Ship (wobble + approach) -->
    {#if step !== "done" && shipAnchor && !startedMidflight && !reducedMotion}
      <div
        class="ship"
        class:wobble={step === "wobble"}
        class:approach={step === "approach" ||
          step === "tally" ||
          step === "reveal" ||
          step === "outcome"}
        style={shipStyle}
      >
        ⛵
      </div>
    {/if}

    <!-- Counter chips during tally + reveal -->
    {#if (step === "tally" || step === "reveal" || step === "outcome") && !reducedMotion}
      <div class="chips">
        <div class="chip amber" title="Cities (barbarian strength)">
          <span class="chip-icon">🏛️</span>
          <span class="chip-label">Cities</span>
          <span class="chip-count">{citiesCounted}</span>
        </div>
        <div class="versus {step === 'reveal' || step === 'outcome' ? 'big' : ''}">
          {vsGlyph}
        </div>
        <div class="chip sky" title="Knights (total defense)">
          <span class="chip-icon">⚔️</span>
          <span class="chip-label">Knights</span>
          <span class="chip-count">{knightsCounted}</span>
        </div>
      </div>
    {/if}

    <!-- SVG ring layer (tally + outcome) -->
    {#if (step === "tally" || step === "reveal" || step === "outcome") && boardBox && !reducedMotion}
      <svg
        class="ring-layer"
        width={overlaySize.w}
        height={overlaySize.h}
        viewBox="0 0 {overlaySize.w} {overlaySize.h}"
      >
        <!-- City rings (amber) -->
        {#each cityRefs.slice(0, cityRingsDrawn) as c (c.vid)}
          <circle
            cx={c.screen.x}
            cy={c.screen.y}
            r="18"
            fill="none"
            stroke="#f5c842"
            stroke-width="4"
            class="ring ring-amber"
          />
        {/each}
        <!-- Knight rings (sky) -->
        {#each knightRefs.slice(0, knightRingsDrawn) as k (k.vid)}
          <circle
            cx={k.screen.x}
            cy={k.screen.y}
            r="18"
            fill="none"
            stroke="#6ec9f0"
            stroke-width="4"
            class="ring ring-sky"
          />
        {/each}
      </svg>
    {/if}

    <!-- Knight strength floaters -->
    {#each knightFloaters as f (f.id)}
      <div
        class="floater"
        style="left:{f.x}px;top:{f.y - 26}px"
      >
        {f.label}
      </div>
    {/each}

    <!-- 5. Reveal banner -->
    {#if step === "reveal" || step === "outcome"}
      <div class="reveal-banner" style="color:{outcomeColor}">
        {revealLabel}
      </div>
    {/if}

    <!-- 6. Outcome -->
    {#if step === "outcome" && pending.outcome === "defenders_win" && pending.vpWinners.length === 1}
      <div class="shield shield-win" style="--hero:{heroColor}">
        <div class="shield-icon">🛡️</div>
        <div class="shield-title">Defender of Catan</div>
        <div class="shield-hero">
          <span
            class="hero-swatch"
            style="background:{heroColor}"
          ></span>
          <span class="hero-name">{heroName}</span>
        </div>
        <div class="shield-vp">+1 VP</div>
      </div>
    {/if}

    {#if step === "outcome" && pending.outcome === "tie_draw"}
      <div class="shield shield-tie">
        <div class="shield-icon">🛡️</div>
        <div class="shield-title">Tied Defense</div>
        <div class="shield-sub">Each top defender draws a progress card</div>
        <div class="tie-chips">
          {#each pending.tiedDefenders as pid}
            {@const p = gameState.players[pid]}
            {#if p}
              <span class="tie-chip" style="color:{p.color};border-color:{p.color}">
                {p.name}
              </span>
            {/if}
          {/each}
        </div>
      </div>
    {/if}

    {#if step === "outcome" && pending.outcome === "barbarians_win"}
      <!-- Fires over each pillaged city -->
      {#each pillagedScreens.slice(0, firesLit) as f (f.vid)}
        <div class="fire" style="left:{f.x}px;top:{f.y}px">
          <span class="flame flame-1" aria-hidden="true">🔥</span>
          <span class="flame flame-2" aria-hidden="true">🔥</span>
          <span class="flame flame-3" aria-hidden="true">🔥</span>
          <span class="smoke" aria-hidden="true">💨</span>
        </div>
      {/each}
      <div class="shield shield-loss">
        <div class="shield-icon">🔥</div>
        <div class="shield-title">Barbarians Plunder!</div>
        <div class="shield-sub">
          {pending.citiesPillaged.length} {pending.citiesPillaged.length === 1 ? "city" : "cities"} pillaged
        </div>
      </div>
    {/if}

    <!-- Skip hint -->
    {#if step !== "done" && step !== "outcome"}
      <div class="skip-hint" aria-hidden="true">Click to skip</div>
    {/if}
  </div>
{/if}

<style>
  .barb-overlay {
    position: fixed;
    inset: 0;
    z-index: 450;
    pointer-events: auto;
    cursor: pointer;
  }

  /* 1. Night */
  .night {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      ellipse at 50% 50%,
      rgba(10, 15, 40, 0.45) 0%,
      rgba(5, 8, 24, 0.78) 70%,
      rgba(0, 0, 0, 0.86) 100%
    );
    opacity: 0;
    transition: opacity 800ms ease;
  }
  .night.active {
    opacity: 1;
  }

  /* 2+3. Ship */
  .ship {
    position: fixed;
    font-size: 2.4rem;
    line-height: 1;
    transform: translate(-50%, -50%);
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.9));
    z-index: 460;
    --tx: 0px;
    --ty: 0px;
    will-change: transform;
  }
  .ship.wobble {
    animation: ship-wobble 700ms ease-in-out;
  }
  .ship.approach {
    animation: ship-approach 1200ms cubic-bezier(0.45, 0.05, 0.3, 1) forwards;
  }

  @keyframes ship-wobble {
    0%,
    100% {
      transform: translate(-50%, -50%) rotate(0deg);
    }
    20% {
      transform: translate(-50%, -50%) rotate(-10deg);
    }
    40% {
      transform: translate(-50%, -50%) rotate(10deg);
    }
    60% {
      transform: translate(-50%, -50%) rotate(-8deg);
    }
    80% {
      transform: translate(-50%, -50%) rotate(6deg);
    }
  }

  @keyframes ship-approach {
    0% {
      transform: translate(-50%, -50%) scale(1);
    }
    100% {
      transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty)))
        scale(1.5);
    }
  }

  /* Counter chips */
  .chips {
    position: fixed;
    top: max(1rem, env(safe-area-inset-top, 0px));
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 0.85rem;
    z-index: 470;
    animation: chips-in 350ms ease-out;
  }
  @keyframes chips-in {
    from {
      opacity: 0;
      transform: translate(-50%, -8px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.42rem 0.8rem;
    border-radius: 999px;
    font-weight: 800;
    border: 2px solid;
    background: rgba(16, 24, 40, 0.9);
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.6);
    font-size: 0.95rem;
  }
  .chip.amber {
    color: #ffe08a;
    border-color: #f5c842;
  }
  .chip.sky {
    color: #cbeaff;
    border-color: #6ec9f0;
  }
  .chip-icon {
    font-size: 1.1rem;
  }
  .chip-count {
    font-variant-numeric: tabular-nums;
    font-size: 1.2rem;
    min-width: 1.5ch;
    text-align: center;
  }

  .versus {
    color: #ffffff;
    font-weight: 900;
    font-size: 1.4rem;
    transition: transform 280ms ease;
  }
  .versus.big {
    font-size: 2rem;
    transform: scale(1.25);
    text-shadow: 0 0 12px rgba(255, 255, 255, 0.4);
  }

  /* Ring layer */
  .ring-layer {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 455;
  }
  .ring {
    animation: ring-pulse 1100ms ease-out;
    filter: drop-shadow(0 0 6px currentColor);
  }
  .ring-amber {
    color: #f5c842;
  }
  .ring-sky {
    color: #6ec9f0;
  }
  @keyframes ring-pulse {
    from {
      r: 6;
      opacity: 0;
      stroke-width: 8;
    }
    to {
      r: 22;
      opacity: 1;
      stroke-width: 3;
    }
  }

  /* Knight floaters */
  .floater {
    position: fixed;
    transform: translate(-50%, -50%);
    color: #cbeaff;
    font-weight: 900;
    font-size: 1.15rem;
    text-shadow: 0 0 8px rgba(0, 0, 0, 0.9), 0 0 4px #6ec9f0;
    animation: floater-up 1200ms ease-out forwards;
    z-index: 471;
    pointer-events: none;
  }
  @keyframes floater-up {
    0% {
      opacity: 0;
      transform: translate(-50%, -40%) scale(0.8);
    }
    20% {
      opacity: 1;
      transform: translate(-50%, -55%) scale(1.1);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -90%) scale(1);
    }
  }

  /* Reveal banner */
  .reveal-banner {
    position: fixed;
    top: calc(max(1rem, env(safe-area-inset-top, 0px)) + 3.2rem);
    left: 50%;
    transform: translateX(-50%);
    font-size: clamp(1.4rem, 3.6vw, 2.2rem);
    font-weight: 900;
    letter-spacing: 0.03em;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.8);
    z-index: 472;
    animation: reveal-slide 520ms cubic-bezier(0.2, 0.9, 0.3, 1.2);
  }
  @keyframes reveal-slide {
    from {
      opacity: 0;
      transform: translate(-50%, -14px) scale(0.9);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0) scale(1);
    }
  }

  /* Outcome shield */
  .shield {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    padding: 1.4rem 2rem;
    border-radius: 18px;
    background: rgba(16, 24, 40, 0.94);
    border: 3px solid rgba(255, 255, 255, 0.15);
    color: #ffffff;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    z-index: 475;
    box-shadow: 0 12px 60px rgba(0, 0, 0, 0.75),
      0 0 40px rgba(245, 200, 66, 0.15);
    animation: shield-in 520ms cubic-bezier(0.25, 1.4, 0.4, 1) forwards;
    min-width: 16rem;
  }
  .shield-win {
    border-color: var(--hero, #6dbf6d);
    box-shadow: 0 12px 60px rgba(0, 0, 0, 0.75),
      0 0 60px var(--hero, #6dbf6d);
  }
  .shield-tie {
    border-color: #f5c842;
    box-shadow: 0 12px 60px rgba(0, 0, 0, 0.75), 0 0 40px #f5c84280;
  }
  .shield-loss {
    border-color: #e74c3c;
    box-shadow: 0 12px 60px rgba(0, 0, 0, 0.75), 0 0 60px #e74c3c80;
  }
  @keyframes shield-in {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.6) rotate(-4deg);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1) rotate(0deg);
    }
  }
  .shield-icon {
    font-size: 3.4rem;
    line-height: 1;
    filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.6));
  }
  .shield-title {
    font-size: 1.35rem;
    font-weight: 900;
    letter-spacing: 0.04em;
  }
  .shield-sub {
    font-size: 0.9rem;
    color: #dfe6ef;
    opacity: 0.9;
  }
  .shield-hero {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.1rem;
    font-weight: 800;
  }
  .hero-swatch {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.6);
  }
  .shield-vp {
    font-size: 1.6rem;
    font-weight: 900;
    color: #f5c842;
    text-shadow: 0 0 10px #f5c84290;
    margin-top: 0.2rem;
  }

  .tie-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    justify-content: center;
    margin-top: 0.3rem;
  }
  .tie-chip {
    padding: 0.22rem 0.6rem;
    border-radius: 999px;
    border: 2px solid;
    background: rgba(0, 0, 0, 0.35);
    font-weight: 800;
    font-size: 0.85rem;
  }

  /* Fires over pillaged cities */
  .fire {
    position: fixed;
    transform: translate(-50%, -50%);
    width: 72px;
    height: 72px;
    z-index: 473;
    pointer-events: none;
    animation: fire-ignite 2000ms ease-out forwards;
  }
  .fire .flame {
    position: absolute;
    top: 0;
    left: 50%;
    font-size: 2.2rem;
    filter: drop-shadow(0 0 8px #ff6a00);
    animation: flame-dance 800ms ease-in-out infinite alternate;
  }
  .fire .flame-1 {
    left: 30%;
    animation-delay: 0ms;
  }
  .fire .flame-2 {
    left: 50%;
    animation-delay: 200ms;
    font-size: 2.6rem;
  }
  .fire .flame-3 {
    left: 70%;
    animation-delay: 400ms;
    font-size: 2rem;
  }
  .fire .smoke {
    position: absolute;
    top: -12px;
    left: 50%;
    font-size: 1.6rem;
    opacity: 0.7;
    animation: smoke-rise 2000ms ease-out forwards;
  }
  @keyframes fire-ignite {
    0% {
      transform: translate(-50%, -50%) scale(0.5);
      opacity: 0;
    }
    20% {
      transform: translate(-50%, -50%) scale(1.2);
      opacity: 1;
    }
    100% {
      transform: translate(-50%, -50%) scale(1);
      opacity: 1;
    }
  }
  @keyframes flame-dance {
    0% {
      transform: translateX(-50%) scaleY(1) rotate(-4deg);
    }
    100% {
      transform: translateX(-50%) scaleY(1.15) rotate(4deg);
    }
  }
  @keyframes smoke-rise {
    0% {
      transform: translate(-50%, 0) scale(0.8);
      opacity: 0;
    }
    30% {
      opacity: 0.8;
    }
    100% {
      transform: translate(-50%, -60px) scale(1.6);
      opacity: 0;
    }
  }

  .skip-hint {
    position: fixed;
    bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
    left: 50%;
    transform: translateX(-50%);
    color: rgba(255, 255, 255, 0.65);
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    z-index: 480;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
    pointer-events: none;
  }

  /* Reduced motion fast path */
  .barb-overlay.reduced .ship,
  .barb-overlay.reduced .floater,
  .barb-overlay.reduced .ring-layer,
  .barb-overlay.reduced .fire {
    display: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .ship.approach,
    .ship.wobble,
    .floater,
    .ring,
    .fire,
    .fire .flame,
    .shield {
      animation: none !important;
    }
  }
</style>
