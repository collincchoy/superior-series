import Phaser from "phaser";
import { VIEW_HEIGHT, VIEW_WIDTH } from "./constants.js";
import { BootScene } from "./scenes/BootScene.js";
import { LevelScene } from "./scenes/LevelScene.js";

/** Boot the Arni game into `parent`. `baseUrl` is the site's BASE_URL. */
export function createGame(parent: HTMLElement, baseUrl: string): Phaser.Game {
  return new Phaser.Game({
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
    scene: [new BootScene(baseUrl), LevelScene],
  });
}
