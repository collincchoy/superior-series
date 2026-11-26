import Phaser from "phaser";
import { VIEW_HEIGHT, VIEW_WIDTH } from "../constants.js";
import { moveSelection, PAUSE_OPTIONS, type PauseOptionId } from "../menu.js";
import type { LevelScene } from "./LevelScene.js";

const BUTTON_W = 440;
const BUTTON_H = 76;

/** Big, kid-friendly pause menu. Keyboard (↑/↓ + Enter/Space, Esc to resume) or tap. */
export class PauseScene extends Phaser.Scene {
  private selected = 0;
  private buttons: { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[] = [];

  constructor() {
    super("pause");
  }

  create(): void {
    this.selected = 0;
    this.buttons = [];
    const cx = VIEW_WIDTH / 2;

    this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, 0x1b1433, 0.6).setOrigin(0).setInteractive(); // eat clicks
    this.add.rectangle(cx, VIEW_HEIGHT / 2, BUTTON_W + 80, 420, 0x3a2f66, 0.95).setStrokeStyle(6, 0xffd36a);
    this.add
      .text(cx, VIEW_HEIGHT / 2 - 150, "Paused", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "52px",
        fontStyle: "bold",
        color: "#ffd36a",
        stroke: "#271f40",
        strokeThickness: 8,
      })
      .setOrigin(0.5);

    PAUSE_OPTIONS.forEach((opt, i) => {
      const y = VIEW_HEIGHT / 2 - 50 + i * (BUTTON_H + 18);
      const bg = this.add
        .rectangle(cx, y, BUTTON_W, BUTTON_H, 0x4b3e74)
        .setStrokeStyle(4, 0xffffff)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(cx, y, opt.label, { fontFamily: "system-ui, sans-serif", fontSize: "32px", fontStyle: "bold", color: "#ffffff" })
        .setOrigin(0.5);
      bg.on("pointerover", () => this.select(i));
      bg.on("pointerdown", () => this.choose(opt.id));
      this.buttons.push({ bg, label });
    });
    this.select(0);

    const kb = this.input.keyboard;
    if (kb) {
      const move = (d: number) => this.select(moveSelection(this.selected, d, PAUSE_OPTIONS.length));
      kb.on("keydown-UP", () => move(-1));
      kb.on("keydown-W", () => move(-1));
      kb.on("keydown-DOWN", () => move(1));
      kb.on("keydown-S", () => move(1));
      const confirm = () => this.choose(PAUSE_OPTIONS[this.selected].id);
      kb.on("keydown-ENTER", confirm);
      kb.on("keydown-SPACE", confirm);
      kb.on("keydown-Z", confirm);
      kb.on("keydown-ESC", () => this.choose("resume"));
      kb.on("keydown-P", () => this.choose("resume"));
    }
  }

  private select(i: number): void {
    this.selected = i;
    this.buttons.forEach((b, j) => {
      const on = j === i;
      b.bg.setFillStyle(on ? 0xffd36a : 0x4b3e74);
      b.label.setColor(on ? "#271f40" : "#ffffff");
      b.bg.setScale(on ? 1.04 : 1);
      b.label.setScale(on ? 1.04 : 1);
    });
  }

  private choose(id: PauseOptionId): void {
    const level = this.scene.get("level") as LevelScene;
    this.scene.stop();
    if (id === "restart") {
      this.scene.stop("hud");
      level.scene.restart();
      return;
    }
    if (id === "checkpoint") level.restartFromCheckpoint();
    level.resumeFromPause();
  }
}
