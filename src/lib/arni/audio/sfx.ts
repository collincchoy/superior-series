/**
 * Sound-effect list — the one place that defines how each sound is made.
 * Like the art manifest: to use a recorded file instead, the SoundBank can
 * be pointed at a file for that id; game code only ever says play("jump").
 */
import type { SfxRecipe } from "./synth.js";

export const SFX = {
  // Arni moves
  jump: { wave: "square", freq: 330, freqEnd: 680, ms: 140, volume: 0.28, duty: 0.25 },
  chargedJump: {
    wave: "square",
    freq: 280,
    freqEnd: 1100,
    ms: 280,
    volume: 0.3,
    duty: 0.25,
    layers: [{ wave: "triangle", freq: 140, freqEnd: 520, ms: 280, volume: 0.35 }],
  },
  chargeReady: { wave: "sine", freq: 880, ms: 110, volume: 0.3, arp: [0, 7] },
  land: { wave: "noise", freq: 0, ms: 60, volume: 0.18, layers: [{ wave: "sine", freq: 130, freqEnd: 60, ms: 60, volume: 0.4 }] },
  slide: { wave: "noise", freq: 0, ms: 220, volume: 0.16 },
  whip: { wave: "noise", freq: 0, ms: 130, volume: 0.22, layers: [{ wave: "sine", freq: 900, freqEnd: 320, ms: 130, volume: 0.22 }] },
  sword: {
    wave: "noise",
    freq: 0,
    ms: 170,
    volume: 0.2,
    layers: [{ wave: "square", freq: 1300, freqEnd: 650, ms: 170, volume: 0.14, duty: 0.2 }],
  },
  pound: { wave: "sine", freq: 170, freqEnd: 40, ms: 360, volume: 0.7, layers: [{ wave: "noise", freq: 0, ms: 220, volume: 0.35 }] },
  fireball: { wave: "noise", freq: 0, ms: 240, volume: 0.22, layers: [{ wave: "saw", freq: 320, freqEnd: 140, ms: 240, volume: 0.18 }] },
  hurt: { wave: "saw", freq: 420, freqEnd: 120, ms: 280, volume: 0.3, vibrato: { hz: 30, depth: 0.08 } },
  death: { wave: "square", freq: 620, freqEnd: 70, ms: 950, volume: 0.28, vibrato: { hz: 9, depth: 0.06 }, duty: 0.3 },
  respawn: { wave: "triangle", freq: 300, freqEnd: 900, ms: 320, volume: 0.35 },

  // Hitting things
  stomp: { wave: "square", freq: 520, freqEnd: 140, ms: 130, volume: 0.32, layers: [{ wave: "noise", freq: 0, ms: 50, volume: 0.2 }] },
  enemyHit: { wave: "square", freq: 240, freqEnd: 110, ms: 110, volume: 0.28, duty: 0.3 },
  enemyDefeat: { wave: "square", freq: 600, ms: 160, volume: 0.25, arp: [0, 4, 7, 12], duty: 0.25 },
  break: { wave: "noise", freq: 0, ms: 220, volume: 0.4, layers: [{ wave: "square", freq: 130, freqEnd: 55, ms: 160, volume: 0.25 }] },
  amber: { wave: "sine", freq: 1500, ms: 180, volume: 0.35, layers: [{ wave: "triangle", freq: 2250, ms: 120, volume: 0.25 }] },
  crumble: { wave: "noise", freq: 0, ms: 420, volume: 0.25, layers: [{ wave: "sine", freq: 85, freqEnd: 40, ms: 420, volume: 0.35 }] },
  bounce: { wave: "sine", freq: 190, freqEnd: 720, ms: 260, volume: 0.45, vibrato: { hz: 18, depth: 0.12 } },

  // Pickups
  coin: { wave: "triangle", freq: 1046, ms: 170, volume: 0.32, arp: [0, 4, 7, 12] },
  egg: {
    wave: "triangle",
    freq: 523,
    ms: 760,
    volume: 0.42,
    arp: [0, 4, 7, 12, 16, 19, 24, 24],
    layers: [{ wave: "sine", freq: 262, ms: 760, volume: 0.25, arp: [0, 0, 7, 7, 12, 12, 12, 12] }],
  },
  powerUp: { wave: "square", freq: 262, ms: 620, volume: 0.26, arp: [0, 4, 7, 12, 7, 12, 16, 19], duty: 0.25 },
  heal: { wave: "sine", freq: 660, ms: 420, volume: 0.38, arp: [0, 5, 9, 12] },
  checkpoint: { wave: "triangle", freq: 659, ms: 420, volume: 0.36, arp: [0, 5, 12] },

  // Minions
  peelThrow: { wave: "noise", freq: 0, ms: 90, volume: 0.16, layers: [{ wave: "sine", freq: 820, freqEnd: 420, ms: 90, volume: 0.2 }] },
  crownAim: { wave: "sine", freq: 400, freqEnd: 950, ms: 460, volume: 0.18, vibrato: { hz: 14, depth: 0.04 } },
  magicShot: { wave: "sine", freq: 700, freqEnd: 1400, ms: 230, volume: 0.24, vibrato: { hz: 25, depth: 0.1 } },
  minionAlert: { wave: "square", freq: 880, ms: 90, volume: 0.18, arp: [0, 5], duty: 0.2 },

  // Rex
  rexTaunt: { wave: "saw", freq: 180, ms: 520, volume: 0.22, arp: [0, 3, 0, -2], vibrato: { hz: 6, depth: 0.05 } },
  rexCharge: { wave: "saw", freq: 110, freqEnd: 220, ms: 500, volume: 0.25, layers: [{ wave: "noise", freq: 0, ms: 300, volume: 0.15 }] },
  rexSlam: { wave: "sine", freq: 120, freqEnd: 35, ms: 420, volume: 0.7, layers: [{ wave: "noise", freq: 0, ms: 300, volume: 0.4 }] },
  rexHit: { wave: "square", freq: 220, freqEnd: 80, ms: 320, volume: 0.35, layers: [{ wave: "noise", freq: 0, ms: 150, volume: 0.3 }] },
  rexDefeat: { wave: "square", freq: 420, freqEnd: 60, ms: 1300, volume: 0.3, vibrato: { hz: 8, depth: 0.08 }, duty: 0.3 },
  gateClose: { wave: "noise", freq: 0, ms: 650, volume: 0.32, layers: [{ wave: "square", freq: 72, freqEnd: 50, ms: 650, volume: 0.22 }] },

  // Menus & results
  menuMove: { wave: "square", freq: 660, ms: 50, volume: 0.16, duty: 0.25 },
  menuSelect: { wave: "square", freq: 523, ms: 150, volume: 0.22, arp: [0, 7], duty: 0.25 },
  pause: { wave: "triangle", freq: 440, freqEnd: 330, ms: 130, volume: 0.3 },
  victory: {
    wave: "square",
    freq: 523,
    ms: 1200,
    volume: 0.24,
    duty: 0.25,
    arp: [0, 4, 7, 12, 7, 12, 16, 24],
    layers: [{ wave: "triangle", freq: 262, ms: 1200, volume: 0.35, arp: [0, 0, 7, 7, 12, 12, 12, 12] }],
  },
} satisfies Record<string, SfxRecipe>;

export type SoundId = keyof typeof SFX;
export const SFX_IDS = Object.keys(SFX) as SoundId[];
