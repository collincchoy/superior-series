import Phaser from "phaser";
import { VIEW_HEIGHT, VIEW_WIDTH } from "../constants.js";
import { moveSelection, PAUSE_OPTIONS, type PauseOptionId } from "../menu.js";
import type { LevelScene } from "./LevelScene.js";
import { sound, soundBank } from "./sound.js";

const BUTTON_W = 440;
const BUTTON_H = 60;
const GAP = 12;
const FONT = "system-ui, sans-serif";
const TOGGLES: PauseOptionId[] = ["music", "sfx"];

/** Big, kid-friendly pause menu. Keyboard (↑/↓ + Enter/Space, Esc to resume) or tap. */
export class PauseScene extends Phaser.Scene {
  private selected = 0;
  private buttons: { id: PauseOptionId; bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[] = [];

  constructor() {
    super("pause");
  }

  create(): void {
    this.selected = 0;
    this.buttons = [];
    const cx = VIEW_WIDTH / 2;
    const top = VIEW_HEIGHT / 2 - 120;

    this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, 0x1b1433, 0.6).setOrigin(0).setInteractive(); // eat clicks
    this.add.rectangle(cx, VIEW_HEIGHT / 2 + 30, BUTTON_W + 80, 560, 0x3a2f66, 0.95).setStrokeStyle(6, 0xffd36a);
    this.add
      .text(cx, top - 72, "Paused", { fontFamily: FONT, fontSize: "52px", fontStyle: "bold", color: "#ffd36a", stroke: "#271f40", strokeThickness: 8 })
      .setOrigin(0.5);

    const main = PAUSE_OPTIONS.filter((o) => !TOGGLES.includes(o.id));
    main.forEach((opt, i) => this.addButton(opt.id, cx, top + i * (BUTTON_H + GAP), BUTTON_W, opt.label));
    // Music / Sounds switches side by side under the main buttons.
    const rowY = top + main.length * (BUTTON_H + GAP) + 10;
    const half = (BUTTON_W - GAP) / 2;
    TOGGLES.forEach((id, k) => this.addButton(id, cx - half / 2 - GAP / 2 + k * (half + GAP), rowY, half, this.toggleLabel(id)));
    this.select(0, false);

    const kb = this.input.keyboard;
    if (kb) {
      const move = (d: number) => this.select(moveSelection(this.selected, d, this.buttons.length));
      kb.on("keydown-UP", () => move(-1));
      kb.on("keydown-W", () => move(-1));
      kb.on("keydown-DOWN", () => move(1));
      kb.on("keydown-S", () => move(1));
      kb.on("keydown-LEFT", () => this.selected >= main.length && move(-1));
      kb.on("keydown-RIGHT", () => this.selected >= main.length && move(1));
      const confirm = () => this.choose(this.buttons[this.selected].id);
      kb.on("keydown-ENTER", confirm);
      kb.on("keydown-SPACE", confirm);
      kb.on("keydown-Z", confirm);
      kb.on("keydown-ESC", () => this.choose("resume"));
      kb.on("keydown-P", () => this.choose("resume"));
    }
  }

  private toggleLabel(id: PauseOptionId): string {
    const settings = soundBank(this)?.settings;
    const on = id === "music" ? settings?.music !== false : settings?.sfx !== false;
    return `${id === "music" ? "♪ Music" : "Sounds"}: ${on ? "On" : "Off"}`;
  }

  private addButton(id: PauseOptionId, x: number, y: number, w: number, text: string): void {
    const i = this.buttons.length;
    const bg = this.add.rectangle(x, y, w, BUTTON_H, 0x4b3e74).setStrokeStyle(4, 0xffffff).setInteractive({ useHandCursor: true });
    const label = this.add
      .text(x, y, text, { fontFamily: FONT, fontSize: w < BUTTON_W ? "24px" : "30px", fontStyle: "bold", color: "#ffffff" })
      .setOrigin(0.5);
    bg.on("pointerover", () => this.select(i));
    bg.on("pointerdown", () => this.choose(id));
    this.buttons.push({ id, bg, label });
  }

  private select(i: number, blip = true): void {
    if (blip && i !== this.selected) sound(this).play("menuMove");
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
    if (id === "music" || id === "sfx") {
      soundBank(this)?.toggle(id);
      sound(this).play("menuSelect");
      const b = this.buttons.find((x) => x.id === id);
      b?.label.setText(this.toggleLabel(id));
      return;
    }
    sound(this).play("menuSelect");
    const level = this.scene.get("level") as LevelScene;
    this.scene.stop();
    if (id === "restart") {
      this.scene.stop("hud");
      level.scene.restart();
      return;
    }
    if (id === "levels") {
      this.scene.stop("hud");
      this.scene.stop("level");
      this.scene.start("select");
      return;
    }
    if (id === "checkpoint") level.restartFromCheckpoint();
    level.resumeFromPause();
  }
}
