import Phaser from "phaser";
import { VIEW_HEIGHT, VIEW_WIDTH } from "./constants.js";
import { BootScene } from "./scenes/BootScene.js";
import { HudScene } from "./scenes/HudScene.js";
import { LevelScene } from "./scenes/LevelScene.js";

/** Boot the Arni game into `parent`. `baseUrl` is the site's BASE_URL. */
export function createGame(parent: HTMLElement, baseUrl: string): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIEW_WIDTH,
    height: VIEW_HEIGHT,
    backgroundColor: "#5ec8ff",
    physics: {
      default: "arcade",
      arcade: { debug: false },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [new BootScene(baseUrl), LevelScene, HudScene],
  });

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
