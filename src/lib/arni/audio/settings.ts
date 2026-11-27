/** Music / sound-effect on-off switches, remembered in localStorage. */
import type { StorageLike } from "../save.js";

const KEY = "arni-sound";

export interface SoundSettings {
  music: boolean;
  sfx: boolean;
}

export function defaultSoundSettings(): SoundSettings {
  return { music: true, sfx: true };
}

export function toggle(s: SoundSettings, which: keyof SoundSettings): SoundSettings {
  return { ...s, [which]: !s[which] };
}

export function loadSoundSettings(storage: StorageLike): SoundSettings {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return defaultSoundSettings();
    const d = JSON.parse(raw) as Partial<SoundSettings>;
    return { music: d.music !== false, sfx: d.sfx !== false };
  } catch {
    return defaultSoundSettings();
  }
}

export function storeSoundSettings(storage: StorageLike, s: SoundSettings): void {
  try {
    storage.setItem(KEY, JSON.stringify(s));
  } catch {
    // blocked storage: settings just won't persist
  }
}
