# superior-series

## Project Overview

Astro 6.1 static site deployed to GitHub Pages (`https://collincchoy.github.io/superior-series/`, base path `/superior-series/`). Primary feature: a fully implemented browser-based **Catan: Cities & Knights** board game at `/catan/`.

## Tech Stack

- **Framework**: Astro 6.1 (file-based routing; includes Svelte integration/components)
- **Language**: TypeScript strict
- **Package manager**: pnpm
- **Testing**: Vitest — `pnpm test` (run before committing)
- **Multiplayer**: PeerJS (WebRTC P2P, host-authoritative)
- **Board rendering**: Vanilla SVG (no canvas library)

## Adding Pages

Create `src/pages/name.astro` → auto-routed to `/superior-series/name/`.
Use `import.meta.env.BASE_URL` for internal links (see Navigation.astro).

## Catan Game Architecture

All game logic lives in `src/lib/catan/`:

| File           | Purpose                                            |
| -------------- | -------------------------------------------------- |
| `types.ts`     | All TS interfaces — single source of truth         |
| `constants.ts` | Board layout, card decks, build costs, draw ranges |
| `board.ts`     | Hex grid math, adjacency tables, longest road      |
| `rules.ts`     | `canXxx()` validators — pure, no side effects      |
| `game.ts`      | `applyAction()` reducer + `createInitialState()`   |
| `ai.ts`        | Rule-based bot: `chooseBotAction()`                |
| `network.ts`   | PeerJS host/client wrapper                         |
| `render.ts`    | SVG board renderer (DOM-touching, not unit-tested) |
| `ui.ts`        | Lobby + game UI event wiring                       |

Tests live in `src/test/catan/`. **Always write tests before implementation (TDD).**

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

- **Lobby**: configure 2–4 player slots (human or bot); host creates a room, clients join by room code
- **Setup phases**: yellow dots = valid settlement/city spots; yellow lines = valid road spots — click directly to place
- **Action phase**: action buttons in side panel; clicking a build button highlights valid targets on board, then click a target to confirm
- **Modals**: discard (7-card rule) and bank trade use in-panel modals
- Board callbacks (`onVertexClick`, `onEdgeClick`, `onHexClick`) must be set via `renderer.setCallbacks()` **before** `renderer.render()` — event listeners capture the callback reference at render time

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
- `render.ts` has no unit tests — verify visually with `pnpm dev`
