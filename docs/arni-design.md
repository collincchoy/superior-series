# Arni vs. Rex — Game Design (Prototype v0)

A bright, cartoony 2D platformer for ages 8–16. Arni the dinosaur battles a mortal enemy, Rex the Banana.
Lives at `/superior-series/arni/` as a fully decoupled sibling to the Catan game.

## Pillars
- **Fun, bright, vibrant, cartoony.** Squash and stretch, bouncy feedback, nothing grim.
- **Forgiving.** No game over. Explorers get rewarded with eggs and secret tunnels.
- **Swappable art.** Every visual comes from a named asset in a single manifest.

## Structure
- **10 levels** of increasing difficulty (`src/lib/arni/level/levels/level01–10.ts`), each ending in Rex's arena:
  1. Sunny Start · 2. Branch Hop · 3. Thorny Trail · 4. Lava Lake · 5. Volcano Peak — **Volcanic Jungle**
  6. Factory Gates · 7. Crate Canyon · 8. Peel Plant · 9. Rotten Row · 10. Rex's Throne — **Rex's Banana Factory** (factory art via `themed()`)
- Difficulty ramps through what each level uses (thorns → crumbly rock → lava slabs → Spotters → lifts, Mush, Bruisers) and minion count (3 → 18). Every level: 3 eggs, ≥1 checkpoint, all reachable (tested).
- **Rex scales with the level** (`bossConfig(difficulty)`): 1 hit in level 1, 2 in level 2, then the full 3-phase fight with bigger volleys, faster charges, more minions and shorter (but always ≥~2s) dizzy windows.
- **Level map** (start screen): beating a level unlocks the next; best eggs/coins/trophies per level are saved in localStorage. Victory screen offers Next Level / Play Again / Level Map; the pause menu has Level Map too.
- Dev shortcut: `?level=N` jumps into level N, `?level=test` into the sandbox level.

## Arni — Player
| Action | Notes |
| --- | --- |
| Run / jump | Variable-height jump; coyote time + jump buffering for kid-friendly feel |
| Crouch / crawl | Fits through low tunnels; ducks under projectiles |
| Crouch-charged jump | Hold crouch to charge a higher jump |
| Slide | Crouch while running → slide through gaps, damages enemies |
| Stomp | Land on enemies |
| Tail whip | Short melee swipe; breaks breakable blocks |

**Health:** 3 hearts. Hit → brief invulnerability flash. 0 hearts → respawn at last checkpoint (coins kept). No lives, no game over.

## Power-ups (from amber blocks)
Amber cracks open (bonk from below, whip, fireball or ground pound) and a power-up bubble pops out, then drifts to Arni so it's never stranded. In level text: `h` heart, `f` fire, `p` pound, `w` sword (plain `A` = 3 coins).
- **Extra heart** — heals 1; at full health grants one golden bonus heart (lost first).
- **Fire roar** (20s) — K/C shoots fireballs: hit minions, burn crates, crack amber, pop peels.
- **Ground pound** (20s) — ↓ in mid-air slams down: smashes the block underfoot, shockwave hits nearby minions.
- **Sword** (20s) — the tail spin swings a sword: ~2× reach, 2 damage (one-shots Bruisers).
- Timed powers stack, show as HUD badges with countdown rings (blink in the last 3s), and are lost when hearts run out.

## Collectibles
- **Coins** (leaf/gem style) — score counter.
- **3 hidden dino eggs** — tucked in secret areas / crawl tunnels.

## Enemies — Rex's Banana Minions (ripeness = behavior)
| Ripeness | Name | Behavior | HP |
| --- | --- | --- | --- |
| Green | Bunchling | Jittery walker; panics and runs off ledges. Basic enemy. | 1 |
| Ripe yellow | Peelback | Cocky; charges when it sees Arni. | 1 |
| Bruised | Bruiser | Slow, tough. | 2 |
| Brown / spotty | Spotter | Sleepy; sits on ledges and lobs peels (duck or whip them). | 1 |
| Rotten | Mush | Leaves slippery goo trail; splits into 2 mini-Mush when hit. | 1 (+splits) |
| (crown) | Crownie | Flying crown like Rex's (`c`). Hovers and bobs; when Arni is in range it glows red ("!") then shoots a slow purple magic fireball straight at Arni. Stomp, whip or fireball it; the whip also swats its shots. **Levels 7–10 only**, more each level. | 1 |

## Special Blocks & Hazards
Art direction: **organic prehistoric jungle**, not a block grid — mossy rounded ledges over layered rock with fossils, tree-branch platforms, a volcano backdrop.
- **Breakables** (tail whip / ground pound): cracked **boulders** in the jungle, **Rex's banana crates** in the factory
- **Amber blocks** — glowing amber with a shadowy something inside; bonk/whip to release coins or power-ups
- **Branches** — one-way platforms (jump up through, land on top)
- **Thorns** — bramble hazard
- Bouncy mushroom / jelly — launches Arni high
- Crumbling platforms — fall shortly after being stood on
- Moving platforms — horizontal / vertical paths
- Other hazards — lava, goo (1 damage + knockback)

## Boss — Rex the Banana (3-phase arena)
1. **Peel Barrage** — throws peels in arcs; dizzy after a volley → stomp.
2. **Banana Charge** — dashes across arena, slams wall, dizzy → stomp.
3. **Minion Call** — summons minions + mixes earlier attacks, faster.

3 hits total (one per phase); each phase faster. Rex can only be hurt while **dizzy** (stars, swirly eyes) — by stomp, whip/sword, fireball or ground pound. Stomping a non-dizzy Rex just bounces Arni off ("Ha! Too slow!"), no damage.

Arena (level text): `|` gate, `K` Rex. Crossing into the arena raises the gate behind Arni, locks the camera, shows the REX bar, and moves the respawn point inside the arena.

**Rex's Throne (level 10):** Rex sits on a golden throne, taunting, while the minions placed inside the arena (6 guards, incl. a Crownie) attack. Rex can't be hurt or hurt Arni while seated ("Beat my guards first!"). When every guard — and any mini mushes they split into — is beaten, Rex leaps off the throne ("Fine! I'll squash you myself!") and the full fight begins.

Victory screen: three trophies — Beat Rex, All Eggs, 40+ Coins — plus time and Play Again.

## Controls
- **Keyboard:** Arrows/WASD move, Space/W/Up jump, Down/S crouch, J/X attack, K/C special (fire roar).
- **Touch:** on-screen D-pad + Jump + Attack buttons (iPad-friendly).
- Gamepad + local multiplayer: future; input is abstracted per player so this slots in later.

## Tech
- **Phaser** (arcade physics, tilemaps, cameras, tweens) inside a Svelte wrapper component on an Astro page.
- **Pure-logic modules** (enemy AI state machines, boss phases, player state machine, damage/health, power-up timers) in `src/lib/arni/`, unit-tested with Vitest per repo TDD rules. Phaser scenes are thin adapters.
- **Art:** SVG sprites under `public/arni/assets/`, referenced by key from one asset manifest. Fixed sprite sizes + foot anchor so hand-drawn PNGs can drop in later with no code changes.
- **Level:** data-driven (tile grid + entity placements) so it's editable without touching code; Tiled JSON is an option later.

## Prototype Milestones
1. Scaffold: `/arni/` page, Svelte wrapper, Phaser boot, asset manifest, test level greybox.
2. Arni movement feel: run, jump, crouch/crawl, charged jump, slide, camera.
3. Combat + health: stomp, tail whip, hearts, checkpoints, respawn.
4. Blocks & hazards; coins, eggs, HUD.
5. Banana minions (all 5).
6. Power-ups.
7. Rex boss fight + victory screen.
8. Touch controls; build the full jungle → factory level; polish (particles, sound).

## Open Questions (non-blocking)
- Sound/music: prototype with simple SFX? Source?
- Story intro: a title card / short cutscene of Rex's villainy?
- Name of the game.
