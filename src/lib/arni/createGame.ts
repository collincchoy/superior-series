import Phaser from "phaser";
import { VIEW_HEIGHT, VIEW_WIDTH } from "./constants.js";
import { SoundBank } from "./audio/SoundBank.js";
import { PHYSICS_FPS } from "./frameTiming.js";
import { BootScene } from "./scenes/BootScene.js";
import { HudScene, TOUCH_MODE_KEY } from "./scenes/HudScene.js";
import { LevelScene } from "./scenes/LevelScene.js";
import { LevelSelectScene } from "./scenes/LevelSelectScene.js";
import { PauseScene } from "./scenes/PauseScene.js";
import { SOUND_KEY } from "./scenes/sound.js";
import { VictoryScene } from "./scenes/VictoryScene.js";

/** Boot the Arni game into `parent`. `baseUrl` is the site's BASE_URL. */
export function createGame(parent: HTMLElement, baseUrl: string): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIEW_WIDTH,
    height: VIEW_HEIGHT,
    backgroundColor: "#5ec8ff",
    // We synthesize our own audio (audio/SoundBank.ts). Phaser's sound manager
    // stays off: it opened a second AudioContext whose focus/blur handlers threw
    // "closed AudioContext" errors around navigation.
    audio: { noAudio: true },
    fps: {
      // Phaser's delta smoothing clamps every frame to 16.7ms while the window
      // is unfocused and for 120 frames after it regains focus. Below 60fps
      // that turns into slow motion right when the player starts moving.
      // Use real frame time instead; our own logic caps dt at 50ms.
      smoothStep: false,
    },
    physics: {
      default: "arcade",
      // Step at least as often as a 120Hz screen redraws (see frameTiming.ts).
      arcade: { debug: false, fps: PHYSICS_FPS },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [new BootScene(baseUrl), LevelSelectScene, LevelScene, HudScene, PauseScene, VictoryScene],
  });

  // Touch devices (phones/tablets) get on-screen controls from the start;
  // anything else switches them on at its first real touch (see HudScene).
  game.registry.set(TOUCH_MODE_KEY, window.matchMedia?.("(pointer: coarse)").matches ?? false);

  // Our own synthesized audio (Phaser's is off). Closed with the game.
  const sounds = new SoundBank(localStorage);
  game.registry.set(SOUND_KEY, sounds);
  game.events.once(Phaser.Core.Events.DESTROY, () => sounds.destroy());

  if (import.meta.env.DEV) {
    // Dev-only handle for poking at the game from the browser console:
    //   __arni.level().debugState()  /  __arni.level().debugTeleport(tx, ty)
    (window as unknown as Record<string, unknown>).__arni = {
      game,
      level: () => game.scene.getScene("level") as LevelScene,
    };
  }
  return game;
}
