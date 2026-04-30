# Catan first-turn / ActionPanel regression — notes

Summary of what was investigated and what shipped for the bug where **PhaseBanner** showed “Roll the dice” while **ActionPanel** still showed setup copy (“click a yellow dot… place your city”) and the primary roll control did not match expectations.

## Symptoms

- Game state (export / Master Control) showed **`phase: "ROLL_DICE"`**, correct **`currentPlayerId`**, **`setupQueue: []`**, **`lastRoll: null`** in at least one captured snapshot.
- UI showed conflicting guidance: phase strip matched rolling, side panel action area matched **setup city** placement.
- User impact: could not proceed normally on the first main-phase turn (no usable Roll Dice affordance in that broken render).

## Hypotheses considered

### Dice acknowledgement (`pendingDiceAck` / `DiceRollModal`)

- After commit **`dea4c22`**, [`GameView.svelte`](../src/components/catan/GameView.svelte) derives **`pendingDiceAck`** from **`lastRoll`** vs **`acknowledgedRollId`** and drives [`DiceRollModal`](../src/components/catan/DiceRollModal.svelte).
- With **`lastRoll === null`**, **`pendingDiceAck`** is **false** (short-circuit on `lastRoll !== null`), so the dice modal **cannot** explain the stuck first-turn UI **if** the live client state matched the exported JSON.
- Conclusion for that repro: **deprioritize** dice-ack as root cause; keep it in mind when **`lastRoll !== null`** and modal stacking matters.

### Layout / overlay

- Earlier suspicion: [`BoardPendingBanner`](../src/components/catan/BoardPendingBanner.svelte) used **`position: fixed`** and covered the bottom of the viewport, hiding controls in the side panel.
- Mitigation tried in the same thread: render the banner **inline** inside [`SidePanel.svelte`](../src/components/catan/SidePanel.svelte) instead of overlaying the viewport; remove duplicate mount from [`GameView.svelte`](../src/components/catan/GameView.svelte).
- User follow-up indicated the **same `side-panel` div** contained **both** correct banner text **and** wrong setup copy — pointing away from “only overlay” and toward **wrong branch content inside ActionPanel** or **stale DOM**.

### Server / reducer

- Setup completes in [`game.ts`](../src/lib/catan/game.ts) on **`PLACE_ROAD`** when setup queue empties: **`phase → ROLL_DICE`**, **`currentPlayerId → playerOrder[0]`**.
- No evidence the reducer was emitting **`SETUP_R2_CITY`** while **`ROLL_DICE`** was exported; mismatch looked **client-render** side.

### Turn actors / trade offers

- Commit **`5fe3ac4`** scoped **`pendingTradeOffer`** acting overrides to **`ACTION`** only and added **`ROLL_DICE` / `END_TURN`** guards.
- Captured stuck state had **`pendingTradeOffer: null`** — not implicated for that snapshot.

### Git history (high level)

- **`dea4c22`**: dice acknowledgement sequencing + `GameView` gating (strong candidate for *modal* sequencing, weaker for *setup vs roll copy* when `lastRoll` null).
- **`8fb4e2b`**: dice modal / overlays in `GameView`.
- **`ff0b954`** / **`893c988`**: large **`ActionPanel`** changes.
- **`BoardPendingBanner.svelte`** was **untracked** for a period — bisect on that file was not possible until committed.

## Fix implemented (ActionPanel)

**File:** [`src/components/catan/ActionPanel.svelte`](../src/components/catan/ActionPanel.svelte)

1. **Removed `{#key gameState.phase}`** around the large **`{#if}` / `{:else if}`** phase branch chain. Forcing remount on phase-only key risked **stale fragments** when transitioning **`SETUP_R2_CITY` → `ROLL_DICE`** while other UI updated from the same `gameState`.
2. **Added `let phase = $derived(gameState.phase)`** and used **`phase`** in those branches so the chain tracks one derived value (attempted `{@const phase = …}` inside `<div>` was **invalid** in Svelte — replaced with `$derived` in `<script>`).
3. **Normalized markup** for **`ROLL_DICE`** and **`ROBBER_MOVE`** buttons (proper `<button type="button">…</button>` instead of split `</button` lines).

Verification run after change: **`pnpm test`**, **`pnpm exec astro check`**, **`pnpm run build`**.

## What was not proven

- No automated UI test reproduces the stale-branch glitch; fix is based on static analysis + symptom match + removing risky `{#key}` pattern.
- If the bug reappears, next steps: log **`store.gameState.phase` / `version`** at render time vs export; confirm host vs joiner; consider Svelte/version-specific `{#key}` issues.

## Related files

- [`SidePanel.svelte`](../src/components/catan/SidePanel.svelte) — phase banner, hand, pending board banner, conditional `ActionPanel`.
- [`PhaseBanner.svelte`](../src/components/catan/PhaseBanner.svelte) / [`phaseLabel.ts`](../src/components/catan/phaseLabel.ts) — banner text.
- [`GameView.svelte`](../src/components/catan/GameView.svelte) — dice modal and overlay gating.
- [`boardPendingUi.ts`](../src/lib/catan/boardPendingUi.ts) — pending board instruction copy (not the setup “yellow dot” strings).
