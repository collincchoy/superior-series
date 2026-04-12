# superior-series

## Project Overview

Astro 6.1 static site deployed to GitHub Pages (`https://collincchoy.github.io/superior-series/`, base path `/superior-series/`). Primary feature: a fully implemented browser-based **Catan: Cities & Knights** board game at `/catan/`.

## Tech Stack

- **Framework**: Astro 6.1 (file-based routing; includes Svelte integration/components)
- **Language**: TypeScript strict
- **Package manager**: pnpm
- **Testing**: Vitest — `pnpm test` (run before committing)
- **Multiplayer**: PeerJS (WebRTC P2P, host-authoritative)
- **Board rendering**: SVG via `BoardCanvas.svelte` + `svgHelpers.ts`
- **QR code**: `qrcode` (generation) + `@zxing/browser` (scanning) for room-code join flow

## Test-Driven Development

**Always write tests before implementation.** This is not optional — treat failing tests as the spec.

1. Write a failing test in `src/test/catan/` that captures the expected behavior.
2. Run `pnpm test` to confirm it fails for the right reason.
3. Implement the minimum code to make it pass.
4. Refactor if needed, keeping tests green.

Tests cover all pure logic in `src/lib/catan/`. Svelte components are not unit-tested — verify visually with `pnpm dev`.

## Adding Pages

Create `src/pages/name.astro` → auto-routed to `/superior-series/name/`.
Use `import.meta.env.BASE_URL` for internal links (see Navigation.astro).

## Catan Game Architecture

### Core logic — `src/lib/catan/`

| File               | Purpose                                                        |
| ------------------ | -------------------------------------------------------------- |
| `types.ts`         | All TS interfaces — single source of truth                     |
| `constants.ts`     | Board layout, card decks, build costs, draw ranges             |
| `board.ts`         | Hex grid math, adjacency tables, longest road                  |
| `rules.ts`         | `canXxx()` validators — pure, no side effects                  |
| `game.ts`          | `applyAction()` reducer + `createInitialState()`               |
| `ai.ts`            | Rule-based bot: `chooseBotAction()`                            |
| `network.ts`       | PeerJS host/client wrapper                                     |
| `store.svelte.ts`  | Reactive UI state (`$state`); singleton `store`; `net` must NOT be `$state` (PeerJS circular refs) |
| `validTargets.ts`  | Compute valid click targets (vertices/edges/hexes) for current game state |
| `svgHelpers.ts`    | Pure SVG coordinate math (unit-tested in `svgHelpers.test.ts`) |
| `turnActors.ts`    | Determine which player(s) can act in a given phase             |

### UI components — `src/components/catan/`

28 Svelte 5 components replace the old `render.ts`/`ui.ts` layer:

- **`CatanApp.svelte`** — root; routes between `lobby / waiting / game` screens
- **`BoardCanvas.svelte`** — SVG board rendering + `onVertexClick` / `onEdgeClick` / `onHexClick` handlers
- **`LobbyView.svelte`**, **`WaitingView.svelte`**, **`GameView.svelte`** — top-level screen views
- **`ActionPanel.svelte`**, **`SidePanel.svelte`**, **`PlayersPanel.svelte`**, **`HandPanel.svelte`** — game HUD
- Modals: `DiscardModal.svelte`, `TradeBankModal.svelte`, `CommercialHarborModal.svelte`, `InfoModal.svelte`
- Feedback: `Toast.svelte`, `LogPanel.svelte`, `PhaseBanner.svelte`

All reactive state flows through `store.svelte.ts`; components read from `store` and dispatch actions via `applyAction`.

## Key C&K Rules (differs from base Catan)

- Win at **13 VP** (not 10)
- Setup round 2: place **city** + road (not settlement)
- Three dice: 2 production + 1 event die (ship advances barbarians; color triggers progress draw)
- **Robber is inactive** until first barbarian attack
- Cities produce resource + commodity (forest→paper, mountains→coin, pasture→cloth)
- Barbarian track: 7 spaces; attack when ship reaches end; metropolis cities immune to pillaging
- City improvements: 3 tracks (science/paper, trade/cloth, politics/coin), 5 levels each
- Progress card hand limit: 4 (VP cards placed face-up don't count)

Full rules in `catan_base_rules.txt` and `catan_ck_rules.txt` (converted from PDF).

## UI / UX

- **Lobby**: configure 2–4 player slots (human or bot); host creates a room, clients join by room code or QR scan
- **Setup phases**: yellow dots = valid settlement/city spots; yellow lines = valid road spots — click directly to place
- **Action phase**: action buttons in side panel; clicking a build button highlights valid targets on board, then click a target to confirm
- **Modals**: discard (7-card rule) and bank trade use in-panel modals

## AI Players

- 1–4 total players; any slot can be a bot
- Bots run on the host only; `chooseBotAction()` is called in a loop until turn ends
- Bots must always return a valid action (tested in `ai.test.ts`)

## P2P Flow

- Host: `new Peer()` → room code = `peer.id` shown in banner after game starts
- Client: enter room code in lobby → `peer.connect(roomCode)` → sends JOIN → receives full GameState
- All actions go Client → Host → `applyAction` → broadcast full state to all peers
- Bot turns execute on host after every action via `runBotTurns()` loop
- PeerJS loaded from CDN (`unpkg.com/peerjs@1.5.4`) at runtime; cached by service worker

## PWA

- Manifest: `public/catan-manifest.json`
- Service worker: `public/catan-sw.js` (cache-first for own assets, network-first for PeerJS CDN)
- Icons: `public/catan-icons/` (SVG, 192×192 and 512×512)
- Mobile-first layout; board takes full width, side panel below (desktop: side panel on right)

## Dev Notes

- `pnpm dev` may pick port 4322 if 4321 is occupied — HMR websocket will fail in that case; use hard-refresh (Cmd+Shift+R) or kill stale servers first
- Errors from `applyAction` on the host are surfaced via toast and `console.error`; check browser console if actions appear to do nothing
- Svelte components have no unit tests — verify visually with `pnpm dev`
