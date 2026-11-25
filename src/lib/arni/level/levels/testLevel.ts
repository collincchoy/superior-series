/**
 * Greybox jungle test level for Milestones 1–3. Edit freely!
 *
 * Legend (see ../legend.ts):
 *   .  empty           #  ground (mossy ledge / rock)   =  branch (one-way)
 *   R  boulder (break)  X  banana crate (break)          A  amber (mystery)
 *   ^  thorns           P  player start  o  coin  E  hidden egg  C  checkpoint
 *   Banana minions: g bunchling (green)  y peelback (ripe)  b bruiser (bruised)
 *                   s spotter (brown)    m mush (rotten)
 *
 * Rules (checked by tests):
 * - Every row must be the same length.
 * - Everything must be reachable (src/lib/arni/level/reachability.ts):
 *   normal jump climbs 2 tiles, charged crouch-jump climbs 4.
 *
 * Tour: coin arc + amber → boulder ledge → thorn pit → branch staircase →
 * crawl tunnel with egg → checkpoint → charged-jump pillar with egg →
 * stepped ledges → pit → plateau with branches, minions and Rex's crates.
 */
export const TEST_LEVEL: readonly string[] = [
  "....................................................................................................",
  "....................................................................................................",
  ".....................................................................................s..............",
  "................................A..................................................=====............",
  "...................................................................A......oo........................",
  ".........................oooo...........................E......................===..........X.......",
  "..........A...................====.....................##.......................b..........XX...m...",
  ".......o...............................................##............####...########################",
  "......o.o.......R.......=====.........########.........##.........#######...########################",
  "..P..........#####.........g........o.....E....o.C.....##...y..##########...########################",
  "##################...####################################################...########################",
  "##################^^^####################################################...########################",
];
