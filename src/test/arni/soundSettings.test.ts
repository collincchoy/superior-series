import { describe, it, expect } from "vitest";
import { defaultSoundSettings, loadSoundSettings, storeSoundSettings, toggle } from "../../lib/arni/audio/settings.js";

class FakeStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

describe("sound settings", () => {
  it("music and effects start on", () => {
    expect(defaultSoundSettings()).toEqual({ music: true, sfx: true });
  });

  it("toggles each independently", () => {
    const s = toggle(defaultSoundSettings(), "music");
    expect(s).toEqual({ music: false, sfx: true });
    expect(toggle(s, "sfx")).toEqual({ music: false, sfx: false });
  });

  it("are remembered between visits", () => {
    const store = new FakeStorage();
    storeSoundSettings(store, { music: false, sfx: true });
    expect(loadSoundSettings(store)).toEqual({ music: false, sfx: true });
  });

  it("fall back to defaults on missing, corrupt or blocked storage", () => {
    const store = new FakeStorage();
    expect(loadSoundSettings(store)).toEqual(defaultSoundSettings());
    store.setItem("arni-sound", "nope{");
    expect(loadSoundSettings(store)).toEqual(defaultSoundSettings());
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadSoundSettings(broken)).toEqual(defaultSoundSettings());
    expect(() => storeSoundSettings(broken, defaultSoundSettings())).not.toThrow();
  });
});
