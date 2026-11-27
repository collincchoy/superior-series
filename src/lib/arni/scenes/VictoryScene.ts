import Phaser from "phaser";
import { VIEW_HEIGHT, VIEW_WIDTH } from "../constants.js";
import type { Score } from "../pickups.js";
import { COIN_TROPHY, type Trophies } from "../victory.js";
import { LEVELS } from "../level/levels/index.js";
import type { LevelScene, LevelStartData } from "./LevelScene.js";

export interface VictoryData {
  score: Score;
  timeMs: number;
  trophies: Trophies;
  /** -1 for the sandbox test level. */
  levelIndex: number;
}

const FONT = "system-ui, sans-serif";

/** "You beat Rex!" — results, three trophies, Next Level / Play Again / Level Map. */
export class VictoryScene extends Phaser.Scene {
  constructor() {
    super("victory");
  }

  create(data: VictoryData): void {
    const cx = VIEW_WIDTH / 2;
    const cy = VIEW_HEIGHT / 2;
    this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, 0x1b1433, 0.65).setOrigin(0).setInteractive();
    const panel = this.add.container(cx, cy);
    panel.add(this.add.rectangle(0, 0, 640, 520, 0x3a2f66, 0.97).setStrokeStyle(6, 0xffd36a));
    const finale = data.levelIndex === LEVELS.length - 1;
    const title = finale ? "Rex is beaten for good!" : "You beat Rex!";
    const blurb = finale ? "You saved every\nbanana. Hooray!" : "Rex will be back…\non to the next level!";
    panel.add(
      this.add
        .text(0, -210, title, { fontFamily: FONT, fontSize: finale ? "44px" : "56px", fontStyle: "bold", color: "#ffd36a", stroke: "#271f40", strokeThickness: 9 })
        .setOrigin(0.5),
    );
    panel.add(this.add.image(-150, -110, "arni-idle").setScale(1.2));
    panel.add(this.add.image(150, -100, "rex-defeated").setScale(0.75));
    panel.add(
      this.add
        .text(0, -100, blurb, { fontFamily: FONT, fontSize: "24px", fontStyle: "bold", color: "#ffffff", align: "center" })
        .setOrigin(0.5),
    );

    // Trophies
    const t = data.trophies;
    const items: { key: string; label: string; got: boolean }[] = [
      { key: "rex", label: "Beat Rex", got: t.rex },
      { key: "egg", label: `All Eggs (${data.score.eggs}/${data.score.eggsTotal})`, got: t.eggs },
      { key: "coin", label: `${COIN_TROPHY}+ Coins (${data.score.coins})`, got: t.coins },
    ];
    items.forEach((it, i) => {
      const x = (i - 1) * 190;
      const ring = this.add.circle(x, 40, 48, it.got ? 0xffd36a : 0x271f40, it.got ? 1 : 0.6).setStrokeStyle(5, 0xffffff, it.got ? 1 : 0.4);
      const icon = this.add.image(x, 40, it.key === "rex" ? "rex" : it.key === "egg" ? "egg" : "coin").setScale(it.key === "rex" ? 0.45 : 1.3);
      if (!it.got) icon.setAlpha(0.35);
      const label = this.add
        .text(x, 104, it.label, { fontFamily: FONT, fontSize: "20px", fontStyle: "bold", color: it.got ? "#ffffff" : "#a99fcc", align: "center", wordWrap: { width: 170 } })
        .setOrigin(0.5, 0);
      panel.add([ring, icon, label]);
      if (it.got) {
        ring.setScale(0);
        icon.setScale(0);
        this.tweens.add({ targets: [ring], scale: 1, delay: 300 + i * 250, duration: 400, ease: "Back.out" });
        this.tweens.add({ targets: [icon], scale: it.key === "rex" ? 0.45 : 1.3, delay: 300 + i * 250, duration: 400, ease: "Back.out" });
      }
    });

    const secs = Math.round(data.timeMs / 1000);
    panel.add(
      this.add
        .text(0, 170, `Time: ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`, { fontFamily: FONT, fontSize: "22px", color: "#d6ccff" })
        .setOrigin(0.5),
    );

    // Buttons: Next Level (main), Play Again, Level Map.
    const hasNext = data.levelIndex >= 0 && data.levelIndex < LEVELS.length - 1;
    const buttons: { label: string; go: () => void; main?: boolean }[] = [
      ...(hasNext ? [{ label: "Next Level ▶", go: () => this.goTo(data.levelIndex + 1), main: true }] : []),
      { label: "Play Again", go: () => this.goTo(data.levelIndex), main: !hasNext },
      { label: "Level Map", go: () => this.toMap() },
    ];
    const w = 190;
    buttons.forEach((b, i) => {
      const x = (i - (buttons.length - 1) / 2) * (w + 14);
      const rect = this.add
        .rectangle(x, 222, w, 60, b.main ? 0xffd36a : 0x4b3e74)
        .setStrokeStyle(4, 0xffffff)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(x, 222, b.label, { fontFamily: FONT, fontSize: "24px", fontStyle: "bold", color: b.main ? "#271f40" : "#ffffff" })
        .setOrigin(0.5);
      panel.add([rect, label]);
      rect.on("pointerover", () => rect.setScale(1.05));
      rect.on("pointerout", () => rect.setScale(1));
      rect.on("pointerdown", b.go);
    });
    const main = buttons.find((b) => b.main) ?? buttons[0];
    const kb = this.input.keyboard;
    kb?.once("keydown-ENTER", main.go);
    kb?.once("keydown-SPACE", main.go);

    panel.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 450, ease: "Back.out" });
  }

  private goTo(levelIndex: number): void {
    const level = this.scene.get("level") as LevelScene;
    this.scene.stop();
    this.scene.stop("hud");
    level.scene.restart({ levelIndex } satisfies LevelStartData);
  }

  private toMap(): void {
    this.scene.stop();
    this.scene.stop("hud");
    this.scene.stop("level");
    this.scene.start("select");
  }
}
