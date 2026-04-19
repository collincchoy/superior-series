<script lang="ts">
  import type {
    GameState,
    ImprovementTrack,
    PlayerId,
  } from "../../lib/catan/types.js";
  import type { PlayerCardDeltaToast } from "../../lib/catan/store.svelte.js";
  import { store } from "../../lib/catan/store.svelte.js";
  import { computeVP } from "../../lib/catan/game.js";
  import DeltaChip from "./DeltaChip.svelte";
  import { totalCards } from "./cardEmoji.js";

  let {
    gameState,
    localPid,
    playerConnectionStatus = {},
  }: {
    gameState: GameState;
    localPid: PlayerId;
    playerConnectionStatus?: Partial<Record<PlayerId, "connected" | "disconnected">>;
  } = $props();

  const TRACK_COLORS: Record<ImprovementTrack, string> = {
    science: "#2e9e4f",
    trade: "#f1c232",
    politics: "#2f6fe4",
  };

  const TRACK_LABEL: Record<ImprovementTrack, string> = {
    science: "🔬",
    trade: "🤝",
    politics: "⚔️",
  };

  function openAbilityInfo(track: ImprovementTrack) {
    store.openInfoModal({ kind: "city-improvement-ability", track });
  }

  const TRACK_SORT_ORDER: Record<ImprovementTrack, number> = {
    science: 0,
    trade: 1,
    politics: 2,
  };

  const TRACKS: ImprovementTrack[] = ["science", "trade", "politics"];

  const TERRAIN_TO_RESOURCE_LABEL = {
    hills: "brick",
    forest: "wood",
    mountains: "ore",
    fields: "grain",
    pasture: "wool",
    desert: null,
  } as const;

  function progressCountsByTrack(progressCards: GameState["players"][PlayerId]["progressCards"]) {
    const counts: Record<ImprovementTrack, number> = {
      science: 0,
      trade: 0,
      politics: 0,
    };

    for (const card of progressCards) {
      counts[card.track] += 1;
    }

    return (Object.entries(counts) as Array<[ImprovementTrack, number]>)
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => TRACK_SORT_ORDER[left] - TRACK_SORT_ORDER[right]);
  }

  function metropolisTracksByPlayer(gameState: GameState, pid: PlayerId): ImprovementTrack[] {
    return TRACKS.filter((track) => gameState.metropolisOwner[track] === pid);
  }

  function toastsForPlayer(pid: PlayerId): PlayerCardDeltaToast[] {
    return store.cardDeltaToasts.filter((toast) => toast.pid === pid);
  }

  function merchantBadgeLabel(gameState: GameState): string {
    const merchantHex = gameState.board.merchantHex;
    if (!merchantHex) return "Controls merchant";

    const terrain = gameState.board.hexes[merchantHex]?.terrain;
    const resource = terrain ? TERRAIN_TO_RESOURCE_LABEL[terrain] : null;
    if (!resource) return "Controls merchant";

    return `Controls merchant (${resource} trades at 2:1)`;
  }
</script>

<div class="players-bar">
  {#each gameState.playerOrder as pid}
    {@const p = gameState.players[pid]!}
    {@const vp = computeVP(gameState, pid)}
    {@const cards = totalCards(p.resources)}
    {@const progressCounts = progressCountsByTrack(p.progressCards)}
    {@const vpCards = p.progressCards.filter(c => c.isVP)}
    {@const defenderVp = p.vpTokens}
    {@const metropolisTracks = metropolisTracksByPlayer(gameState, pid)}
    {@const merchantLabel = merchantBadgeLabel(gameState)}
    <div
      class="player-card{pid === gameState.currentPlayerId ? ' active' : ''}"
      style="border-top: 3px solid {p.color};{pid === gameState.currentPlayerId ? `--glow-color: ${p.color}` : ''}"
    >
      <span class="name">
        {p.name}{p.isBot ? " 🤖" : ""}
        {#if !p.isBot && pid !== localPid && playerConnectionStatus[pid]}
          <span
            class="conn-dot {playerConnectionStatus[pid] === 'connected' ? 'is-connected' : 'is-disconnected'}"
            title={playerConnectionStatus[pid] === "connected"
              ? "Connected"
              : "Disconnected"}
            aria-label={playerConnectionStatus[pid] === "connected"
              ? "Connected"
              : "Disconnected"}
          ></span>
        {/if}
      </span>
      <span class="vp">
        <span>{vp} VP</span>
        {#if gameState.board.merchantOwner === pid}
          <span class="vp-indicator" title={merchantLabel}>🏪</span>
        {/if}
        {#if defenderVp > 0}
          <span class="vp-indicator">{defenderVp} 🛡️</span>
        {/if}
        {#if gameState.longestRoadOwner === pid}
          <span class="vp-indicator road-badge" title="Longest Road (+2 VP)">🛣️</span>
        {/if}
        {#if vpCards.length > 0}
          <span class="vp-indicator gold-glow" title="{vpCards.map(c => c.name).join(', ')} (+{vpCards.length} VP)">📜{vpCards.length > 1 ? ` ×${vpCards.length}` : ""}</span>
        {/if}
        {#if metropolisTracks.length > 0}
          <span class="vp-metropolises" aria-label="Metropolis victory points">
            {#each metropolisTracks as track}
              <span
                class="progress-dot metropolis-dot"
                style={`background:${TRACK_COLORS[track]}`}
                title={`${track} metropolis`}
                aria-hidden="true"
              ></span>
            {/each}
          </span>
        {/if}
      </span>
      <div class="improvements-row">
        {#each (["science", "trade", "politics"] as ImprovementTrack[]) as track}
          {@const level = p.improvements[track]}
          {@const isL3 = level >= 3}
          {#if isL3}
            <button
              class="improve-badge level3 gold-glow"
              style="color:{TRACK_COLORS[track]}"
              title="{track} level {level} — click to view level 3 ability"
              onclick={() => openAbilityInfo(track)}
            >{TRACK_LABEL[track]}{level}</button>
          {:else}
            <span
              class="improve-badge"
              class:zero={level === 0}
              style="color:{TRACK_COLORS[track]}"
            >{TRACK_LABEL[track]}{level}</span>
          {/if}
        {/each}
      </div>
      <div class="cards-row">
        <span class="cards">{cards} 🃏</span>
        {#if progressCounts.length}
          <div class="progress-summary" aria-label="Progress cards by track">
            {#each progressCounts as [track, count]}
              <span
                class="progress-chip"
                title={`${count} ${track} progress card${count === 1 ? "" : "s"}`}
              >
                <span
                  class="progress-dot"
                  style={`background:${TRACK_COLORS[track]}`}
                  aria-hidden="true"
                ></span>
                <span>{count}</span>
              </span>
            {/each}
          </div>
        {/if}
      </div>

      {#if toastsForPlayer(pid).length > 0}
        <div class="delta-stack" aria-label="Recent card changes">
          {#each toastsForPlayer(pid) as toast (toast.id)}
            <div class="delta-toast">
              {#each toast.tokens as token, idx (idx)}
                <DeltaChip kind={token.kind} amount={token.amount} compact={true} />
              {/each}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .players-bar {
    display: flex;
    background: #1a2a1a;
    border-bottom: 2px solid #2c5f2e;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .player-card {
    flex: 1;
    min-width: 108px;
    display: flex;
    position: relative;
    flex-direction: column;
    align-items: center;
    padding: 0.3rem 0.45rem;
    opacity: 0.55;
    gap: 0.06rem;
  }
  .player-card.active {
    opacity: 1;
    background: rgba(255, 255, 255, 0.06);
    box-shadow: inset 0 0 12px color-mix(in srgb, var(--glow-color, #f5c842) 25%, transparent);
    animation: player-glow 2.5s ease-in-out infinite;
  }

  @keyframes player-glow {
    0%, 100% {
      box-shadow: inset 0 0 12px color-mix(in srgb, var(--glow-color, #f5c842) 25%, transparent);
    }
    50% {
      box-shadow: inset 0 0 18px color-mix(in srgb, var(--glow-color, #f5c842) 40%, transparent);
    }
  }
  .name {
    font-size: 0.75rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
  }

  .conn-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    border: 1px solid rgba(0, 0, 0, 0.45);
    display: inline-block;
    flex: 0 0 auto;
  }

  .conn-dot.is-connected {
    background: #6dbf6d;
  }

  .conn-dot.is-disconnected {
    background: #e07b7b;
  }

  .vp {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.24rem;
    font-size: 1rem;
    font-weight: 700;
    color: #f5c842;
  }

  .vp-indicator {
    font-size: 0.7rem;
    font-weight: 700;
    color: #f0ddb5;
    line-height: 1;
  }

  .road-badge {
    animation: road-badge-in 350ms cubic-bezier(0.34, 1.5, 0.64, 1);
  }

  @keyframes road-badge-in {
    from { opacity: 0; transform: scale(0.4); }
    to   { opacity: 1; transform: scale(1); }
  }


  .vp-metropolises {
    display: inline-flex;
    align-items: center;
    gap: 0.14rem;
  }

  .metropolis-dot {
    width: 7px;
    height: 7px;
  }
  .cards-row {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.3rem;
    min-height: 1rem;
  }

  .cards {
    font-size: 0.7rem;
    color: #a0b0a0;
  }

  .improvements-row {
    display: inline-flex;
    gap: 0.35rem;
    font-size: 0.66rem;
    font-weight: 700;
  }

  .improve-badge {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    font-size: 0.66rem;
    font-weight: 700;
    cursor: default;
    line-height: 1;
  }

  button.improve-badge {
    cursor: pointer;
    border-radius: 3px;
    padding: 0 2px;
  }

  .gold-glow {
    text-shadow: 0 0 5px gold, 0 0 2px gold;
    outline: 1px solid rgba(255, 215, 0, 0.45);
    outline-offset: 1px;
    border-radius: 2px;
  }

  .improve-badge.level3 {
    border-radius: 3px;
  }

  .zero {
    opacity: 0.4;
  }

  .progress-summary {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.22rem;
  }

  .progress-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.18rem;
    font-size: 0.62rem;
    font-weight: 700;
    color: #dfe7df;
    line-height: 1;
  }

  .progress-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    border: 1px solid rgba(0, 0, 0, 0.35);
    display: inline-block;
    flex: 0 0 auto;
  }

  .delta-stack {
    position: absolute;
    top: 0.2rem;
    right: 0.2rem;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.2rem;
    pointer-events: none;
  }

  .delta-toast {
    display: inline-flex;
    gap: 0.18rem;
    animation: delta-slide-fade 450ms ease-out;
  }

  @keyframes delta-slide-fade {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .player-card.active { animation: none; }
    .delta-toast { animation: none; }
    .road-badge { animation: none; }
  }
</style>
