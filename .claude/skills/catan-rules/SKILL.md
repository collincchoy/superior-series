---
name: catan-rules
description: Complete Catan Cities & Knights rules reference. Use when implementing game logic, validating rules, or answering rules questions. Covers setup, turn structure, dice, production, building, city improvements, knights, barbarians, progress cards, and victory.
---

# Catan: Cities & Knights — Rules Reference

Full rules are in `catan_ck_rules.txt` and `catan_base_rules.txt`. This skill summarizes what matters for the implementation.

---

## Victory

**Win at 13 VP** (not 10). Check at the start/end of the active player's turn only — not mid-turn of another player. VP sources:

| Source | VP |
|--------|----|
| Settlement | 1 |
| City | 2 |
| City with metropolis | 4 (2 city + 2 metropolis) |
| Longest Route (≥5) | 2 |
| VP progress cards (face-up) | 1 each |
| VP token from barbarian defense | 1 |
| Merchant control | 1 |

**Largest Army is NOT used in C&K** — remove it from play.

---

## Setup

**Round 1** (clockwise): Each player places 1 settlement + 1 road adjacent to it.

**Round 2** (reverse/counter-clockwise): Each player places 1 **city** (not settlement) + 1 road adjacent to it. After placing the city, collect **1 resource per adjacent hex** (deserts produce nothing; only 1 card per hex regardless of city).

Distance rule applies to both rounds: all buildings must be ≥2 edges apart.

---

## Turn Structure

1. **Roll Dice phase** — roll all 3 dice; resolve event die first
2. **Production phase** — collect resources/commodities, or resolve a 7
3. **Action phase** — build, trade, recruit/move knights, play progress cards (any order, any number of times)

---

## The Three Dice

**2 production dice** (red + yellow) — sum determines which hexes produce.

**1 event die** — 6 faces:
- **Ship (×3)** — advance barbarian ship 1 space on track
- **Science icon (×1)** — players draw science progress cards
- **Trade icon (×1)** — players draw trade progress cards
- **Politics icon (×1)** — players draw politics progress cards

**Drawing progress cards:** When an event die shows a track icon, each player whose cube is at or past the range containing the red die value draws 1 card from that deck.

Draw ranges per level:
- Level 1: red die = 1
- Level 2: red die = 1–3  
- Level 3: red die = 1–4
- Level 4: red die = 1–5
- Level 5: red die = 1–6 (but level 5 = metropolis, cube doesn't go higher)

Cards are drawn in turn order starting with the current player. Drawn VP cards must be placed face-up immediately.

---

## Production

**Settlements** collect 1 resource per adjacent hex (as normal).

**Cities** collect both a resource AND a commodity per adjacent hex:

| Terrain | Resource | Commodity |
|---------|----------|-----------|
| Forest | lumber | paper |
| Mountains | ore | coin |
| Pasture | wool | cloth |
| Fields | grain | grain (2×) |
| Hills | brick | brick (2×) |
| Desert | — | — |

Fields and Hills have no commodity — cities produce 2 of the base resource instead.

---

## Resolving a 7

1. **Discard**: Any player with more than 7 cards (resources + commodities) discards half (rounded down). City walls each increase the limit by 2 (e.g., 1 wall → limit 9, 2 walls → limit 11).
2. **Robber**: The robber does **not activate until after the first barbarian attack**. Before that, rolling a 7 still triggers discards, but the robber doesn't move and you can't steal. After the first attack, the robber is placed on the desert and activates normally (move it + steal 1 card from a player on that hex).

---

## Building Costs

| Thing | Cost |
|-------|------|
| Road | 1 brick + 1 lumber |
| Settlement | 1 brick + 1 lumber + 1 wool + 1 grain |
| City | 3 ore + 2 grain |
| City wall | 2 brick |
| Recruit knight (basic) | 1 ore + 1 wool |
| Promote knight | 1 ore + 1 grain |
| Activate knight | 1 grain |
| City improvement (level N) | N commodities of that track's type |

**City improvement commodity types:**
- Science track → paper
- Trade track → cloth
- Politics track → coin

---

## City Walls

- Placed under a city (one per city, max 3 total on the board at once).
- Each wall increases the discard threshold by 2.
- If the city is pillaged to a settlement during a barbarian attack, the wall is also removed (returned to supply).

---

## City Improvements

- 3 tracks: **science**, **trade**, **politics** — each has 5 levels.
- Must have ≥1 city on the board to improve. Cannot improve if you have no cities (e.g. all pillaged), but existing improvements are kept.
- To advance: pay N commodities of the track type to reach level N (cannot skip).
- You may only improve if you have a city available to place the metropolis if needed.

**Level 3 permanent abilities:**
- Science: if you receive no production on a roll, take 1 resource of your choice (not on a 7)
- Trade: trade any 2 identical commodities for any 1 resource or commodity
- Politics: may promote strong knights (level 2) to mighty knights (level 3)

**Level 4 — temporary metropolis:** First player to reach level 4 takes that metropolis piece and places it on one of their cities (+2 VP). Can be taken by another player who reaches level 5.

**Level 5 — permanent metropolis:** First player to reach level 5 gains permanent control. No one can take it away (except through a special progress card).

Each metropolis must be on a different city. If you don't have a free city, you cannot purchase the level 4/5 improvement.

---

## Knights

6 per player (2 each of strength 1/2/3). Knights occupy intersections and interact with roads as if they were buildings.

**Placement rules:**
- Must connect to the player's road network (no distance rule).
- Cannot be placed where there's an opponent's building/knight.
- You can only recruit **basic (level 1)** knights. To get more basics, promote one first.

**Promote:** Costs 1 ore + 1 grain. Replace the knight with the next level. Requires politics level ≥3 to promote strong→mighty. Only once per turn per knight.

**Activate:** Costs 1 grain. Stand the knight up. On the same turn: may recruit then activate, or take an action then activate — but **cannot activate then take an action that same turn**.

**Knight actions** (active knights only, at start of Action phase):
- **Move** — along own continuous route to an empty intersection. Cannot pass through opponent pieces. Knight becomes inactive afterward.
- **Displace** — move to an intersection with a weaker opponent knight. Knight must be strictly stronger. Opponent must then move their displaced knight (or remove it if no legal move). Both become inactive.
- **Chase robber** — knight adjacent to the robber hex; move the robber to a new hex (normal robber rules apply). Knight becomes inactive.

**After barbarian attack:** All knights on the board become inactive.

**Road blocking:** You cannot build a road past an opponent's knight (active or inactive). Knights break longest route calculations at their intersection.

---

## Barbarian Track

7 spaces. Each ship face on the event die advances the ship 1 space.

**When the ship reaches the end — Barbarians Attack:**

1. **Barbarian strength** = total number of cities on the board (including metropolises)
2. **Defender strength** = sum of strength values of all **active** knights on the board

**Barbarians win** (barbarian strength > defender strength):
- Players are ranked by their active knight contribution (ascending).
- The player(s) with the **lowest** contribution each have **one city pillaged** (reduced to settlement; city wall also removed).
- Metropolises **cannot be pillaged**.
- Players with zero active knights are automatically lowest.
- Continue pillaging up the ranking until at least one city has been pillaged total.

**Defenders win** (defender strength ≥ barbarian strength):
- The player(s) with the **highest** active knight contribution each receive a **VP token**.
- If multiple players are tied for highest, no one gets a VP token — instead, each tied player draws 1 progress card of their choice.

**After every attack:**
- Return the barbarian ship to the starting position.
- Lay all knights down (they become inactive).
- If this was the **first attack**: move the robber from the barbarian track area to the desert hex; the robber is now active.

---

## Progress Cards

**Hand limit: 4** progress cards. VP progress cards are placed face-up in your player area and do **not** count toward the limit.

- On your turn: play/discard down to 4 by end of Action phase.
- Off your turn: discard down to 4 immediately upon drawing.
- May play any number of progress cards in the Action phase.
- **Exception: Alchemy** must be played at the start of Roll Dice phase (before rolling).
- After playing, discard face-down to the bottom of its deck.
- No benefit from a card still counts as played.

### Science Cards
| Card | Qty | Effect |
|------|-----|--------|
| Alchemy | 2 | Before rolling: set both production dice to any values; still roll and resolve event die |
| Crane | 2 | Build 1 city improvement for 1 commodity less (min 0) |
| Engineering | 1 | Build 1 city wall free |
| Invention | 2 | Swap any 2 number discs (not 2, 6, 8, or 12); robber stays put |
| Irrigation | 2 | Take 2 grain per field hex adjacent to any of your buildings |
| Medicine | 2 | Upgrade 1 settlement to city for 1 wheat + 2 ore |
| Mining | 2 | Take 2 ore per mountain hex adjacent to any of your buildings |
| Road Building | 2 | Place 2 roads free |
| Smithing | 2 | Promote up to 2 knights free (still once per knight per turn) |
| Printing (VP) | 1 | 1 VP; play immediately face-up |

### Trade Cards
| Card | Qty | Effect |
|------|-----|--------|
| Commercial Harbor | 2 | Offer each player 1 resource; they must give you 1 commodity (or take back your card if they have none) |
| Guild Dues | 2 | Look at a player's hand who has ≥ your VP; take any 2 cards |
| Merchant | 6 | Take merchant piece; place on land hex next to your building; trade that hex's resource at 2:1 this turn onward |
| Merchant Fleet | 2 | Name 1 resource/commodity; trade it 2:1 for rest of this turn |
| Resource Monopoly | 4 | Name a resource; each player gives you 2 (or 1 if they only have 1) |
| Trade Monopoly | 2 | Name a commodity; each player gives you 1 |

### Politics Cards
| Card | Qty | Effect |
|------|-----|--------|
| Diplomacy | 2 | Remove an "open" road (one endpoint not touching own road/building and not part of a route connecting two own buildings/knights). If your own road, build 1 free road immediately |
| Encouragement | 2 | Activate all your knights free |
| Espionage | 3 | Look at a player's progress cards; optionally take 1 (not VP cards) |
| Intrigue | 2 | Displace a knight without using one of yours (target must be on an intersection connected to one of your routes) |
| Sabotage | 2 | Each player with ≥ your VP discards half their resource+commodity cards (rounded down) |
| Taxation | 2 | Move robber to new hex; steal 1 random card from each player with a building there (only usable after first barbarian attack) |
| Treason | 2 | Another player removes one of their knights; you may place one of yours (same or lower strength, same active/inactive status) following normal placement rules |
| Wedding | 2 | Each player with more VP than you gives you 2 resource/commodity cards of their choice |
| Constitution (VP) | 1 | 1 VP; play immediately face-up |

---

## Trade

- Domestic trade: only on your turn; others may not trade among themselves.
- Maritime (bank): default 4:1 any resource; 3:1 at generic harbor; 2:1 at matching harbor.
- Commodities can be traded with other players freely (resources ↔ commodities OK).
- Bank trades: 4:1 or 3:1 may trade commodities for resources or vice versa.
- Progress cards cannot be traded.

---

## Longest Route

Works the same as base Catan but called "Longest Route." First to 5 continuous roads/ships gets +2 VP. Knights **interrupt** opponents' routes (break continuity at the intersection).

---

## Key Differences from Base Catan

| Rule | Base Catan | Cities & Knights |
|------|-----------|-----------------|
| Win condition | 10 VP | 13 VP |
| Setup round 2 | Settlement + road | **City** + road |
| Starting resources | Both rounds | R2 city only (1 per adjacent hex) |
| Robber activation | Immediate | After first barbarian attack |
| Cities produce | 2 resources | 1 resource + 1 commodity |
| Largest Army | Used (dev cards) | **Removed** |
| Development cards | Used | **Replaced** by progress cards |
| Extra dice | No | Event die (barbarians + progress) |
