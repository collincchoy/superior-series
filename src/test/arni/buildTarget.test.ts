import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import config from "../../../astro.config.mjs";

/**
 * Old iPads (iPadOS 12–15) can't parse Vite 7's default output (safari16:
 * class fields, `??=`, `?.`): the module throws a SyntaxError and the page
 * stays blank. Keep the build target low enough for them.
 */
describe("build target", () => {
  it("lowers bundle syntax for Safari 12", () => {
    const target = config.vite?.build?.target;
    const targets = Array.isArray(target) ? target : [target];
    expect(targets).toContain("safari12");
  });
});

/**
 * Astro's island loader is prebuilt with `?.`, and the Svelte runtime calls
 * `String.prototype.replaceAll` (Safari 13.1), so the Arni page must boot
 * the game from a plain script, not a framework island.
 */
describe("arni page", () => {
  const page = readFileSync(resolve(__dirname, "../../pages/arni.astro"), "utf8");

  it("does not hydrate a framework island", () => {
    expect(page).not.toMatch(/client:(only|load|idle|visible|media)/);
    expect(page).not.toMatch(/\.svelte["']/);
  });

  it("shows startup errors on screen (old iPads have no easy dev tools)", () => {
    expect(page).toMatch(/id="boot-error"/);
  });
});
