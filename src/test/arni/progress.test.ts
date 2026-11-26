import { describe, it, expect } from "vitest";
import { activateCheckpoint, initialProgress, respawnTile } from "../../lib/arni/progress.js";
import { parseLevel } from "../../lib/arni/level/parseLevel.js";

const level = parseLevel(["P...C...C.", "##########"]);

describe("checkpoints", () => {
  it("respawn at the player start before any checkpoint", () => {
    expect(respawnTile(level, initialProgress())).toEqual({ tx: 0, ty: 0 });
  });

  it("touching a checkpoint makes it the respawn point", () => {
    const { progress, activated } = activateCheckpoint(initialProgress(), { tx: 4, ty: 0 });
    expect(activated).toBe(true);
    expect(respawnTile(level, progress)).toEqual({ tx: 4, ty: 0 });
  });

  it("re-touching the active checkpoint is not a new activation", () => {
    const first = activateCheckpoint(initialProgress(), { tx: 4, ty: 0 }).progress;
    expect(activateCheckpoint(first, { tx: 4, ty: 0 }).activated).toBe(false);
  });

  it("the latest checkpoint touched wins", () => {
    let p = activateCheckpoint(initialProgress(), { tx: 8, ty: 0 }).progress;
    p = activateCheckpoint(p, { tx: 4, ty: 0 }).progress;
    expect(respawnTile(level, p)).toEqual({ tx: 4, ty: 0 });
  });
});
