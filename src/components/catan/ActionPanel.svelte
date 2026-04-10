<script lang="ts">
  import type { GameState, PlayerId, GameAction, ImprovementTrack } from '../../lib/catan/types.js';
  import type { PendingAction } from '../../lib/catan/validTargets.js';
  import { store } from '../../lib/catan/store.svelte.js';
  import {
    canBuildRoad, canBuildSettlement, canBuildCity, canBuildCityWall,
    canRecruitKnight, canPromoteKnight, canActivateKnight, canImproveCity,
  } from '../../lib/catan/rules.js';
  import { buildGraph } from '../../lib/catan/board.js';
  import TradeBankModal from './TradeBankModal.svelte';

  let { gameState, localPid, pendingAction }: {
    gameState: GameState;
    localPid: PlayerId;
    pendingAction: PendingAction | null;
  } = $props();

  const graph = buildGraph();
  let showTrade = $state(false);

  function send(action: GameAction) { store.sendAction(action); }
  function pending(pa: PendingAction | null) { store.setPendingAction(pa); }

  let board = $derived(gameState.board);
  let me = $derived(gameState.players[localPid]!);
  let pid = $derived(localPid);

  let canRoad     = $derived(Object.keys(graph.edges).some(eid => canBuildRoad(board, graph, me, eid as any)));
  let canSettle   = $derived(Object.keys(graph.vertices).some(vid => canBuildSettlement(board, graph, me, vid as any)));
  let canCity     = $derived(Object.entries(board.vertices).some(([vid, b]) => b?.type === 'settlement' && b.playerId === pid && canBuildCity(board, me, vid as any)));
  let canWall     = $derived(Object.entries(board.vertices).some(([vid, b]) => b?.type === 'city' && b.playerId === pid && !b.hasWall && canBuildCityWall(board, me, vid as any)));
  let canKnight   = $derived(Object.keys(graph.vertices).some(vid => canRecruitKnight(board, graph, me, vid as any)));
  let canPromote  = $derived(Object.entries(board.knights).some(([vid, k]) => k?.playerId === pid && canPromoteKnight(board, me, vid as any, pid)));
  let canActivate = $derived(Object.entries(board.knights).some(([vid, k]) => k?.playerId === pid && canActivateKnight(board, me, vid as any, pid)));

  const tracks: ImprovementTrack[] = ['science', 'trade', 'politics'];
  const trackLabel: Record<ImprovementTrack, string> = { science: '🔬 Science', trade: '🤝 Trade', politics: '⚔️ Politics' };
</script>

<div class="action-panel">
  {#if gameState.phase === 'SETUP_R1_SETTLEMENT'}
    <p class="action-instruction">👆 Click a yellow dot on the board to place your settlement</p>
  {:else if gameState.phase === 'SETUP_R1_ROAD'}
    <p class="action-instruction">👆 Click a yellow line on the board to place your road</p>
  {:else if gameState.phase === 'SETUP_R2_CITY'}
    <p class="action-instruction">👆 Click a yellow dot on the board to place your city</p>
  {:else if gameState.phase === 'SETUP_R2_ROAD'}
    <p class="action-instruction">👆 Click a yellow line on the board to place your road</p>
  {:else if gameState.phase === 'ROLL_DICE'}
    <button class="action-btn" onclick={() => send({ type: 'ROLL_DICE', pid })}>🎲 Roll Dice</button>
  {:else if gameState.phase === 'ROBBER_MOVE'}
    <button class="action-btn active" disabled>Click a hex to move robber…</button>
  {:else if gameState.phase === 'ACTION'}
    {#if pendingAction?.type === 'build_road'}
      <button class="action-btn active" onclick={() => pending(null)}>Cancel Road</button>
    {:else}
      <button class="action-btn" onclick={() => pending({ type: 'build_road' })} disabled={!canRoad}>🛣️ Road</button>
    {/if}

    {#if pendingAction?.type === 'build_settlement'}
      <button class="action-btn active" onclick={() => pending(null)}>Cancel Settlement</button>
    {:else}
      <button class="action-btn" onclick={() => pending({ type: 'build_settlement' })} disabled={!canSettle}>🏠 Settlement</button>
    {/if}

    {#if pendingAction?.type === 'build_city'}
      <button class="action-btn active" onclick={() => pending(null)}>Cancel City</button>
    {:else}
      <button class="action-btn" onclick={() => pending({ type: 'build_city' })} disabled={!canCity}>🏙️ City</button>
    {/if}

    {#if pendingAction?.type === 'build_city_wall'}
      <button class="action-btn active" onclick={() => pending(null)}>Cancel Wall</button>
    {:else}
      <button class="action-btn" onclick={() => pending({ type: 'build_city_wall' })} disabled={!canWall}>🏰 Wall</button>
    {/if}

    {#if pendingAction?.type === 'recruit_knight'}
      <button class="action-btn active" onclick={() => pending(null)}>Cancel Knight</button>
    {:else}
      <button class="action-btn" onclick={() => pending({ type: 'recruit_knight' })} disabled={!canKnight}>⚔️ Knight</button>
    {/if}

    {#if pendingAction?.type === 'promote_knight'}
      <button class="action-btn active" onclick={() => pending(null)}>Cancel Promote</button>
    {:else}
      <button class="action-btn" onclick={() => pending({ type: 'promote_knight' })} disabled={!canPromote}>⬆️ Promote</button>
    {/if}

    {#if pendingAction?.type === 'activate_knight'}
      <button class="action-btn active" onclick={() => pending(null)}>Cancel Activate</button>
    {:else}
      <button class="action-btn" onclick={() => pending({ type: 'activate_knight' })} disabled={!canActivate}>🛡️ Activate</button>
    {/if}

    {#each tracks as track}
      <button class="action-btn" onclick={() => send({ type: 'IMPROVE_CITY', pid, track })} disabled={!canImproveCity(board, me, track)}>
        {trackLabel[track]}
      </button>
    {/each}

    <button class="action-btn" onclick={() => showTrade = true}>🏦 Trade</button>
    <button class="action-btn" onclick={() => send({ type: 'END_TURN', pid })}>✓ End Turn</button>
  {/if}
</div>

{#if showTrade}
  <TradeBankModal {gameState} {localPid} bind:open={showTrade} />
{/if}
