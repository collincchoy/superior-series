<script lang="ts">
  import { CARD_EMOJI } from "./cardEmoji.js";
  import type { CardDeltaKind } from "../../lib/catan/uiEffects.js";

  let {
    kind,
    amount,
    compact = false,
  }: {
    kind: CardDeltaKind;
    amount: number;
    compact?: boolean;
  } = $props();

  let isGain = $derived(amount > 0);

  function iconForKind(value: CardDeltaKind): string {
    if (value === "progress") return "📘";
    if (value in CARD_EMOJI) return CARD_EMOJI[value as keyof typeof CARD_EMOJI];
    return "🃏";
  }

  function labelForAmount(value: number): string {
    return value > 0 ? `+${value}` : `${value}`;
  }
</script>

<span class="delta-chip {isGain ? 'gain' : 'loss'}" class:compact>
  <span class="delta-icon">{iconForKind(kind)}</span>
  <span>{labelForAmount(amount)}</span>
</span>

<style>
  .delta-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.12rem;
    border-radius: 999px;
    padding: 0.08rem 0.36rem;
    font-size: 0.66rem;
    font-weight: 700;
    line-height: 1.2;
    border: 1px solid rgba(255, 255, 255, 0.25);
    backdrop-filter: blur(2px);
    color: #fff;
  }

  .delta-chip.compact {
    padding: 0.05rem 0.32rem;
    font-size: 0.62rem;
  }

  .delta-chip.gain {
    background: rgba(40, 140, 70, 0.82);
  }

  .delta-chip.loss {
    background: rgba(170, 62, 62, 0.82);
  }

  .delta-icon {
    font-size: 0.66rem;
  }
</style>
