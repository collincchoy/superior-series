# Arni vs. Rex — Game Design (Prototype v0)

A bright, cartoony 2D platformer for ages 8–16. Arni the dinosaur battles a mortal enemy, Rex the Banana.
Lives at `/superior-series/arni/` as a fully decoupled sibling to the Catan game.

## Pillars
- **Fun, bright, vibrant, cartoony.** Squash and stretch, bouncy feedback, nothing grim.
- **Forgiving.** No game over. Explorers get rewarded with eggs and secret tunnels.
- **Swappable art.** Every visual comes from a named asset in a single manifest.

## Structure
- One big hand-crafted level: **Sunny prehistoric jungle → Rex's Banana Factory lair → boss arena**.
- Checkpoints placed throughout.

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

## Power-ups (from ? blocks)
- **Extra heart** — heals 1 / bonus heart.
- **Fire roar** — temporary ranged attack.
- **Super stomp** — down + jump in air = ground pound; breaks blocks below, stuns nearby enemies.
- **Sword** — timed (~20s); replaces tail whip with longer-reach, 2-damage slash.

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

3 hits total (one per phase); each phase faster. Victory screen shows coins + eggs found.

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
