import Phaser from "phaser";
import { VIEW_WIDTH } from "../constants.js";
import type { PlayerInput } from "../input.js";
import { POWER, TIMED_POWERS, type TimedPower } from "../powerups.js";
import { inputFromTouches, TOUCH_BUTTONS, type TouchButton } from "../touch.js";

/** Registry keys the level writes and the HUD reads. */
export const HUD_KEYS = {
  hearts: "hearts",
  maxHearts: "maxHearts",
  coins: "coins",
  eggs: "eggs",
  eggsTotal: "eggsTotal",
  /** Object of power-up timers (ms left), mutated in place by the level; read every frame. */
  powers: "powers",
  /** Rex hits left in the boss fight; -1 hides the boss bar. */
  bossHits: "bossHits",
  /** How many hits Rex takes in this level (bar segments). */
  bossMaxHits: "bossMaxHits",
  /** Buttons currently pressed on the touch controls (shared object, written by the HUD each frame). */
  touchInput: "touchInput",
} as const;

/** Game-wide events the HUD emits. */
export const HUD_EVENTS = { pause: "arni:pause" } as const;

/** Registry flag: show on-screen touch controls (touch device, or a touch seen). */
export const TOUCH_MODE_KEY = "touchMode";

export function isTouchMode(registry: Phaser.Data.DataManager): boolean {
  return registry.get(TOUCH_MODE_KEY) === true;
}

const TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: "system-ui, sans-serif",
  fontSize: "30px",
  fontStyle: "bold",
  color: "#ffffff",
  stroke: "#271f40",
  strokeThickness: 6,
};

/** Screen-space overlay: hearts, coins, egg slots, and the pause button. */
export class HudScene extends Phaser.Scene {
  private hearts: Phaser.GameObjects.Image[] = [];
  private eggs: Phaser.GameObjects.Image[] = [];
  private coinText!: Phaser.GameObjects.Text;
  private coinIcon!: Phaser.GameObjects.Image;

  constructor() {
    super("hud");
  }

  create(): void {
    this.hearts = [];
    this.eggs = [];
    // Restart reuses this instance; old game objects are gone.
    this.powerBadges = new Map();
    this.bossBar = null;
    this.bossPips = [];
    this.bossShown = -1;
    this.touchButtons = [];
    this.renderHearts();
    this.createTouchControls();

    this.coinIcon = this.add.image(24, 76, "hud-coin").setOrigin(0);
    this.coinText = this.add.text(64, 74, "× 0", TEXT_STYLE).setOrigin(0);
    this.renderCoins();
    this.renderEggs();

    const pause = this.add
      .image(VIEW_WIDTH - 20, 20, "pause-button")
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    pause.on("pointerover", () => pause.setScale(1.1));
    pause.on("pointerout", () => pause.setScale(1));
    pause.on("pointerdown", () => this.game.events.emit(HUD_EVENTS.pause));

    const on = (k: string, fn: (parent: unknown, value: number, prev: number) => void) => {
      this.registry.events.on(`changedata-${k}`, fn, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.registry.events.off(`changedata-${k}`, fn, this));
    };
    on(HUD_KEYS.hearts, this.onHearts);
    on(HUD_KEYS.coins, this.onCoins);
    on(HUD_KEYS.eggs, this.onEggs);
  }

  private get(k: string, fallback: number): number {
    return (this.registry.get(k) as number | undefined) ?? fallback;
  }

  private renderHearts(): void {
    const max = this.get(HUD_KEYS.maxHearts, 3);
    const cur = this.get(HUD_KEYS.hearts, max);
    // One extra slot for the golden bonus heart, hidden unless earned.
    for (let i = 0; i <= max; i++) {
      const img = this.hearts[i] ?? this.add.image(24 + i * 52, 22, "heart-full").setOrigin(0);
      this.hearts[i] = img;
      if (i === max) img.setTexture("heart-bonus").setVisible(cur > max);
      else img.setTexture(i < cur ? "heart-full" : "heart-empty");
    }
  }

  // ── Power-up timers ───────────────────────────────────────────

  private powerBadges = new Map<TimedPower, { icon: Phaser.GameObjects.Image; ring: Phaser.GameObjects.Graphics }>();

  // ── Touch controls ────────────────────────────────────────────

  private touchButtons: { def: TouchButton; ring: Phaser.GameObjects.Arc; label: Phaser.GameObjects.Text }[] = [];

  private createTouchControls(): void {
    // Up to 4 fingers at once (e.g. run + jump + whip).
    if (this.input.manager.pointersTotal < 5) this.input.addPointer(5 - this.input.manager.pointersTotal);
    for (const def of TOUCH_BUTTONS) {
      const ring = this.add.circle(def.x, def.y, def.r, 0xffffff, 0.18).setStrokeStyle(5, 0xffffff, 0.55).setDepth(50);
      const label = this.add
        .text(def.x, def.y, def.label, {
          fontFamily: "system-ui, sans-serif",
          fontSize: def.label.length > 1 ? "24px" : "44px",
          fontStyle: "bold",
          color: "#ffffff",
          stroke: "#271f40",
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setDepth(51);
      this.touchButtons.push({ def, ring, label });
    }
    this.setTouchVisible(isTouchMode(this.registry));
    // A real touch anywhere switches the controls on (e.g. a laptop with a touchscreen).
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.wasTouch && !isTouchMode(this.registry)) {
        this.registry.set(TOUCH_MODE_KEY, true);
        this.setTouchVisible(true);
      }
    });
  }

  private setTouchVisible(on: boolean): void {
    for (const b of this.touchButtons) {
      b.ring.setVisible(on);
      b.label.setVisible(on);
    }
  }

  /** Read every finger on the screen and publish the pressed buttons for the level. */
  private updateTouch(): void {
    const shared = this.registry.get(HUD_KEYS.touchInput) as PlayerInput | undefined;
    if (!shared || !isTouchMode(this.registry)) return;
    const timers = this.registry.get(HUD_KEYS.powers) as Record<TimedPower, number> | undefined;
    const fireEnabled = (timers?.fire ?? 0) > 0;
    const points = this.input.manager.pointers.filter((p) => p.isDown && p.wasTouch).map((p) => ({ x: p.x, y: p.y }));
    Object.assign(shared, inputFromTouches(points, { fireEnabled }));
    for (const b of this.touchButtons) {
      const isFire = b.def.id === "special";
      b.ring.setVisible(!isFire || fireEnabled);
      b.label.setVisible(!isFire || fireEnabled);
      const pressed = shared[b.def.id];
      b.ring.setFillStyle(isFire ? 0xff7a2e : 0xffffff, pressed ? 0.5 : 0.18);
      b.ring.setScale(pressed ? 0.92 : 1);
    }
  }

  // ── Rex's health bar ──────────────────────────────────────────

  private bossBar: Phaser.GameObjects.Container | null = null;
  private bossPips: Phaser.GameObjects.Rectangle[] = [];
  private bossShown = -1;

  private updateBossBar(): void {
    const hits = (this.registry.get(HUD_KEYS.bossHits) as number | undefined) ?? -1;
    if (hits === this.bossShown) return;
    const prev = this.bossShown;
    this.bossShown = hits;
    if (hits < 0) {
      this.bossBar?.setVisible(false);
      return;
    }
    if (!this.bossBar) {
      const cx = VIEW_WIDTH / 2;
      const label = this.add.text(0, 0, "REX", { ...TEXT_STYLE, fontSize: "28px", color: "#ffd36a" }).setOrigin(1, 0.5);
      const max = (this.registry.get(HUD_KEYS.bossMaxHits) as number | undefined) ?? 3;
      this.bossPips = Array.from({ length: max }, (_, i) => i).map((i) =>
        this.add.rectangle(16 + i * 62, 0, 56, 22, 0xffe14d).setOrigin(0, 0.5).setStrokeStyle(4, 0x271f40),
      );
      this.bossBar = this.add.container(cx - 90, 34, [label, ...this.bossPips]);
      this.bossBar.setAlpha(0);
      this.tweens.add({ targets: this.bossBar, alpha: 1, y: { from: 0, to: 34 }, duration: 400, ease: "Back.out" });
    }
    this.bossBar.setVisible(true);
    this.bossPips.forEach((p, i) => p.setFillStyle(i < hits ? 0xffe14d : 0x3a2f66, i < hits ? 1 : 0.6));
    if (prev > hits && prev >= 0) {
      this.tweens.add({ targets: this.bossBar, scale: { from: 1.25, to: 1 }, duration: 300, ease: "Back.out" });
    }
  }

  update(): void {
    this.updateBossBar();
    this.updateTouch();
    const timers = this.registry.get(HUD_KEYS.powers) as Record<TimedPower, number> | undefined;
    if (!timers) return;
    let slot = 0;
    for (const kind of TIMED_POWERS) {
      const left = timers[kind] ?? 0;
      let badge = this.powerBadges.get(kind);
      if (left <= 0) {
        badge?.icon.setVisible(false);
        badge?.ring.setVisible(false);
        continue;
      }
      if (!badge) {
        badge = { icon: this.add.image(0, 0, `powerup-${kind}`), ring: this.add.graphics() };
        this.powerBadges.set(kind, badge);
      }
      const x = 48 + slot * 60;
      const y = 196;
      slot++;
      // Blink during the last 3 seconds so kids notice it's running out.
      const blink = left < 3000 && Math.floor(left / 150) % 2 === 0;
      badge.icon.setVisible(true).setPosition(x, y).setAlpha(blink ? 0.35 : 1);
      badge.ring.setVisible(true).clear();
      badge.ring.lineStyle(5, 0x271f40, 0.6).strokeCircle(x, y, 27);
      badge.ring
        .lineStyle(5, 0xffd36a, 1)
        .beginPath()
        .arc(x, y, 27, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * left) / POWER.durationMs)
        .strokePath();
    }
  }

  private renderCoins(): void {
    this.coinText.setText(`× ${this.get(HUD_KEYS.coins, 0)}`);
  }

  private renderEggs(): void {
    const total = this.get(HUD_KEYS.eggsTotal, 0);
    const found = this.get(HUD_KEYS.eggs, 0);
    for (let i = 0; i < total; i++) {
      const img = this.eggs[i] ?? this.add.image(24 + i * 38, 122, "hud-egg").setOrigin(0);
      this.eggs[i] = img;
      img.setTexture(i < found ? "hud-egg" : "hud-egg-empty");
    }
  }

  private onHearts(_p: unknown, value: number, previous: number): void {
    this.renderHearts();
    if (value < previous) {
      const lost = this.hearts[value];
      if (lost) this.tweens.add({ targets: lost, scale: { from: 1.5, to: 1 }, duration: 300, ease: "Back.out" });
    } else if (value > previous) {
      this.hearts.slice(0, value).forEach((h, i) =>
        this.tweens.add({ targets: h, scale: { from: 0.4, to: 1 }, delay: i * 80, duration: 260, ease: "Back.out" }),
      );
    }
  }

  private onCoins(): void {
    this.renderCoins();
    this.tweens.killTweensOf(this.coinIcon);
    this.tweens.add({ targets: this.coinIcon, scale: { from: 1.35, to: 1 }, duration: 220, ease: "Back.out" });
  }

  private onEggs(_p: unknown, value: number): void {
    this.renderEggs();
    const egg = this.eggs[value - 1];
    if (egg) this.tweens.add({ targets: egg, scale: { from: 2, to: 1 }, angle: { from: -20, to: 0 }, duration: 500, ease: "Back.out" });
  }
}
