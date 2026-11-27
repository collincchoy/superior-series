import { describe, it, expect } from "vitest";
import config from "../../../astro.config.mjs";

/**
 * Old iPads (iPadOS 13–15) can't parse Vite 7's default output (safari16:
 * class fields, `??=`): the module throws a SyntaxError and the page stays
 * blank. Keep the build target low enough for them.
 */
describe("build target", () => {
  it("lowers bundle syntax for Safari 13", () => {
    const target = config.vite?.build?.target;
    const targets = Array.isArray(target) ? target : [target];
    expect(targets).toContain("safari13");
  });
});
