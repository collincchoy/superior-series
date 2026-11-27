import Phaser from "phaser";
import { VIEW_HEIGHT, VIEW_WIDTH } from "../constants.js";
import { LEVELS } from "../level/levels/index.js";
import { isUnlocked, loadSave, type SaveData } from "../save.js";
import type { LevelStartData } from "./LevelScene.js";
import { sound, soundBank } from "./sound.js";

const FONT = "system-ui, sans-serif";
const NODE_R = 46;
/** Vertical position of each row of level stops (volcano, factory). */
const ROW_Y = [290, 556];

interface Node {
  index: number;
  x: number;
  y: number;
  circle: Phaser.GameObjects.Arc;
}

/** The level map: Volcanic Jungle (1–5) then Rex's Banana Factory (6–10). */
export class LevelSelectScene extends Phaser.Scene {
  private save!: SaveData;
  private nodes: Node[] = [];
  private selected = 0;
  private marker!: Phaser.GameObjects.Image;

  constructor() {
    super("select");
  }

  create(): void {
    this.save = loadSave(localStorage, LEVELS.length);
    this.nodes = [];
    // Start on the furthest unlocked level.
    this.selected = Math.min(this.save.unlocked, LEVELS.length) - 1;

    this.add.image(0, 0, "bg-sky").setOrigin(0).setDisplaySize(VIEW_WIDTH, VIEW_HEIGHT);
    this.add.image(0, 400, "bg-factory-wall").setOrigin(0, 0).setDisplaySize(VIEW_WIDTH, VIEW_HEIGHT - 400).setAlpha(0.95);
    this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, 0x1b1433, 0.25).setOrigin(0);

    this.add
      .text(VIEW_WIDTH / 2, 58, "Arni vs. Rex", { fontFamily: FONT, fontSize: "64px", fontStyle: "bold", color: "#ffd36a", stroke: "#271f40", strokeThickness: 10 })
      .setOrigin(0.5);
    this.add.image(VIEW_WIDTH / 2 - 270, 64, "arni-idle").setScale(0.9);
    this.add.image(VIEW_WIDTH / 2 + 280, 76, "rex").setScale(0.45).setFlipX(false);

    const rowY = [ROW_Y[0] - 140, ROW_Y[1] - 140];
    const regions = ["Volcanic Jungle", "Rex's Banana Factory"];
    regions.forEach((label, r) =>
      this.add
        .text(60, rowY[r], label, { fontFamily: FONT, fontSize: "28px", fontStyle: "bold", color: "#ffffff", stroke: "#271f40", strokeThickness: 6 })
        .setOrigin(0, 0.5),
    );

    // Path dots between stops
    const g = this.add.graphics();
    LEVELS.forEach((_, i) => {
      const a = this.pos(i);
      const b = i < LEVELS.length - 1 ? this.pos(i + 1) : null;
      if (!b) return;
      const steps = 8;
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        g.fillStyle(0xffffff, isUnlocked(this.save, i + 1) ? 0.9 : 0.35);
        g.fillCircle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 4);
      }
    });

    LEVELS.forEach((def, i) => this.makeNode(i, def.name));

    sound(this).playMusic("volcano");
    this.addSoundToggles();
    this.marker = this.add.image(0, 0, "arni-idle").setScale(0.6).setDepth(10);
    this.tweens.add({ targets: this.marker, y: "-=10", duration: 450, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    this.select(this.selected, false);

    this.add
      .text(VIEW_WIDTH / 2, VIEW_HEIGHT - 22, "← → choose · Enter / Space to play · or tap a level", { fontFamily: FONT, fontSize: "20px", color: "#ffffff", stroke: "#271f40", strokeThickness: 4 })
      .setOrigin(0.5);

    const kb = this.input.keyboard;
    if (kb) {
      const step = (d: number) => this.step(d);
      kb.on("keydown-LEFT", () => step(-1));
      kb.on("keydown-A", () => step(-1));
      kb.on("keydown-RIGHT", () => step(1));
      kb.on("keydown-D", () => step(1));
      kb.on("keydown-UP", () => step(-5));
      kb.on("keydown-DOWN", () => step(5));
      kb.on("keydown-ENTER", () => this.play(this.selected));
      kb.on("keydown-SPACE", () => this.play(this.selected));
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => kb.removeAllListeners());
    }
  }

  private pos(i: number): { x: number; y: number } {
    const row = Math.floor(i / 5);
    const col = i % 5;
    return { x: 180 + col * 230, y: ROW_Y[row] + (col % 2) * 30 };
  }

  private makeNode(i: number, name: string): void {
    const { x, y } = this.pos(i);
    const open = isUnlocked(this.save, i);
    const factory = i >= 5;
    const circle = this.add
      .circle(x, y, NODE_R, open ? (factory ? 0x3f7fa6 : 0xd06a3c) : 0x3a2f66)
      .setStrokeStyle(6, open ? 0xffd36a : 0x6b5b9a);
    if (open) {
      circle.setInteractive({ useHandCursor: true });
      circle.on("pointerover", () => this.select(i));
      circle.on("pointerdown", () => this.play(i));
      this.add.text(x, y, String(i + 1), { fontFamily: FONT, fontSize: "40px", fontStyle: "bold", color: "#ffffff", stroke: "#271f40", strokeThickness: 6 }).setOrigin(0.5);
    } else {
      // padlock
      const lock = this.add.graphics();
      lock.lineStyle(6, 0xa99fcc).strokeRoundedRect(x - 12, y - 24, 24, 26, 10);
      lock.fillStyle(0xa99fcc).fillRoundedRect(x - 18, y - 6, 36, 28, 6);
    }
    this.add
      .text(x, y + NODE_R + 18, name, { fontFamily: FONT, fontSize: "18px", fontStyle: "bold", color: open ? "#ffffff" : "#a99fcc", stroke: "#271f40", strokeThickness: 4 })
      .setOrigin(0.5);

    // Trophies earned: Rex, eggs, coins
    const best = this.save.best[i];
    if (best) {
      const marks: [boolean, string][] = [
        [best.trophies.rex, "#ffd36a"],
        [best.trophies.eggs, "#fff6e0"],
        [best.trophies.coins, "#3ee0c4"],
      ];
      marks.forEach(([got, color], k) => {
        const dot = this.add.circle(x - 22 + k * 22, y - NODE_R - 4, 8, Phaser.Display.Color.HexStringToColor(color).color, got ? 1 : 0.2);
        dot.setStrokeStyle(2, 0x271f40);
      });
    }
    this.nodes.push({ index: i, x, y, circle });
  }

  /** Small Music / Sounds switches in the top-left corner. */
  private addSoundToggles(): void {
    const bank = soundBank(this);
    if (!bank) return;
    const make = (which: "music" | "sfx", x: number) => {
      const text = () => `${which === "music" ? "♪ Music" : "Sounds"}: ${bank.settings[which] ? "On" : "Off"}`;
      const bg = this.add.rectangle(x, 34, 150, 44, 0x3a2f66, 0.9).setStrokeStyle(3, 0xffffff).setInteractive({ useHandCursor: true });
      const label = this.add.text(x, 34, text(), { fontFamily: FONT, fontSize: "20px", fontStyle: "bold", color: "#ffffff" }).setOrigin(0.5);
      bg.on("pointerdown", () => {
        bank.toggle(which);
        sound(this).play("menuSelect");
        label.setText(text());
      });
    };
    make("music", 95);
    make("sfx", 255);
  }

  private step(delta: number): void {
    const target = Phaser.Math.Clamp(this.selected + delta, 0, LEVELS.length - 1);
    if (isUnlocked(this.save, target)) this.select(target);
  }

  private select(i: number, animate = true): void {
    if (animate && i !== this.selected) sound(this).play("menuMove");
    this.selected = i;
    const n = this.nodes[i];
    for (const other of this.nodes) other.circle.setScale(other.index === i ? 1.15 : 1);
    if (animate) {
      this.tweens.killTweensOf(this.marker);
      this.tweens.add({ targets: this.marker, x: n.x, y: n.y - NODE_R - 52, duration: 180, ease: "Quad.out" });
      this.tweens.add({ targets: this.marker, y: `-=10`, delay: 180, duration: 450, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    } else {
      this.marker.setPosition(n.x, n.y - NODE_R - 52);
    }
  }

  private play(i: number): void {
    if (!isUnlocked(this.save, i)) return;
    sound(this).play("menuSelect");
    this.scene.start("level", { levelIndex: i } satisfies LevelStartData);
  }
}
