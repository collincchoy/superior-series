import Phaser from "phaser";

/** Registry keys the level writes and the HUD reads. */
export const HUD_KEYS = { hearts: "hearts", maxHearts: "maxHearts" } as const;

/** Screen-space overlay: hearts (coins & eggs arrive in Milestone 4). */
export class HudScene extends Phaser.Scene {
  private hearts: Phaser.GameObjects.Image[] = [];

  constructor() {
    super("hud");
  }

  create(): void {
    this.hearts = [];
    this.render();
    this.registry.events.on(`changedata-${HUD_KEYS.hearts}`, this.onHearts, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.registry.events.off(`changedata-${HUD_KEYS.hearts}`, this.onHearts, this);
    });
  }

  private render(): void {
    const max = (this.registry.get(HUD_KEYS.maxHearts) as number | undefined) ?? 3;
    const cur = (this.registry.get(HUD_KEYS.hearts) as number | undefined) ?? max;
    for (let i = 0; i < max; i++) {
      const img = this.hearts[i] ?? this.add.image(24 + i * 52, 22, "heart-full").setOrigin(0);
      this.hearts[i] = img;
      img.setTexture(i < cur ? "heart-full" : "heart-empty");
    }
  }

  private onHearts(_parent: unknown, value: number, previous: number): void {
    this.render();
    if (value < previous) {
      const lost = this.hearts[value];
      if (lost) this.tweens.add({ targets: lost, scale: { from: 1.5, to: 1 }, duration: 300, ease: "Back.out" });
    } else if (value > previous) {
      this.hearts.slice(0, value).forEach((h, i) =>
        this.tweens.add({ targets: h, scale: { from: 0.4, to: 1 }, delay: i * 80, duration: 260, ease: "Back.out" }),
      );
    }
  }
}
