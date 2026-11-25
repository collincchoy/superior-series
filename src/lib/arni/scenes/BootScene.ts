import Phaser from "phaser";
import { ASSETS, ASSET_DIR, ASSET_KEYS } from "../assets.js";
import { VIEW_HEIGHT, VIEW_WIDTH } from "../constants.js";

/** Loads every asset in the manifest, then starts the level. */
export class BootScene extends Phaser.Scene {
  constructor(private readonly baseUrl: string) {
    super("boot");
  }

  preload(): void {
    this.load.setBaseURL(`${this.baseUrl.replace(/\/$/, "")}/${ASSET_DIR}/`);
    for (const key of ASSET_KEYS) {
      const a = ASSETS[key];
      if (a.file.endsWith(".svg")) {
        this.load.svg(key, a.file, { width: a.width, height: a.height });
      } else {
        this.load.image(key, a.file);
      }
    }

    const bar = this.add.rectangle(VIEW_WIDTH / 2 - 200, VIEW_HEIGHT / 2, 0, 24, 0xffc93c).setOrigin(0, 0.5);
    this.add
      .text(VIEW_WIDTH / 2, VIEW_HEIGHT / 2 - 50, "Loading Arni…", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "32px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.load.on("progress", (p: number) => {
      bar.width = 400 * p;
    });
  }

  create(): void {
    this.scene.start("level");
  }
}
