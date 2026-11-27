import type Phaser from "phaser";
import { SILENT, SoundBank } from "../audio/SoundBank.js";

/** Registry key for the game-wide SoundBank (created in createGame). */
export const SOUND_KEY = "sound";

type Sounds = Pick<SoundBank, "play" | "playMusic" | "stopMusic" | "duck">;

/** The game's SoundBank, or a silent stand-in. */
export function sound(scene: Phaser.Scene): Sounds {
  return (scene.registry.get(SOUND_KEY) as SoundBank | undefined) ?? SILENT;
}

/** The full SoundBank (for settings toggles), if there is one. */
export function soundBank(scene: Phaser.Scene): SoundBank | undefined {
  return scene.registry.get(SOUND_KEY) as SoundBank | undefined;
}
