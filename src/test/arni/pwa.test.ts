import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Arni's installable-app files must stay inside /arni/ so they never clash with Catan's PWA. */
const publicDir = resolve(__dirname, "../../../public");
const BASE = "/superior-series/";
const SCOPE = `${BASE}arni/`;

interface Icon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}
const manifest = JSON.parse(readFileSync(resolve(publicDir, "arni/manifest.webmanifest"), "utf8")) as {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  icons: Icon[];
};

const fileFor = (url: string) => resolve(publicDir, url.slice(BASE.length));

/** Width/height from a PNG's IHDR chunk. */
function pngSize(path: string): [number, number] {
  const buf = readFileSync(path);
  expect(buf.subarray(1, 4).toString("ascii"), path).toBe("PNG");
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

describe("Arni PWA manifest", () => {
  it("is its own app, scoped to /arni/ and separate from Catan", () => {
    expect(manifest.name).toBe("Arni vs. Rex");
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.scope).toBe(SCOPE);
    expect(manifest.start_url.startsWith(SCOPE)).toBe(true);
    expect(manifest.id).toBe(SCOPE);
    expect(["fullscreen", "standalone"]).toContain(manifest.display);
  });

  it("every icon exists under /arni/ with the size it claims", () => {
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith(`${SCOPE}icons/`), icon.src).toBe(true);
      const file = fileFor(icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      if (icon.type === "image/png") {
        const [w, h] = pngSize(file);
        expect(`${w}x${h}`, icon.src).toBe(icon.sizes);
      }
    }
  });

  it("has the icons installers need: 192 and 512 PNGs, and a maskable one", () => {
    const png = manifest.icons.filter((i) => i.type === "image/png");
    expect(png.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(manifest.icons.some((i) => i.purpose?.split(" ").includes("maskable"))).toBe(true);
  });

  it("has a 180px Apple touch icon for iPhone/iPad home screens", () => {
    expect(pngSize(resolve(publicDir, "arni/icons/apple-touch-icon.png"))).toEqual([180, 180]);
  });
});

describe("Arni service worker", () => {
  const sw = readFileSync(resolve(publicDir, "arni/sw.js"), "utf8");

  it("lives in /arni/ so its scope can never cover Catan", () => {
    expect(existsSync(resolve(publicDir, "arni/sw.js"))).toBe(true);
  });

  it("precaches only files that exist", () => {
    const urls = [...sw.matchAll(/`\$\{BASE\}(arni\/[^`]*)`/g)].map((m) => m[1]!);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      if (u.endsWith("/")) continue; // the page itself is built by Astro
      expect(existsSync(resolve(publicDir, u)), u).toBe(true);
    }
  });

  it("only deletes its own caches (never Catan's)", () => {
    expect(sw).toMatch(/k\.startsWith\("arni-"\)/);
  });

  it("Catan's worker leaves Arni's offline cache alone too", () => {
    const catanSw = readFileSync(resolve(publicDir, "catan-sw.js"), "utf8");
    expect(catanSw).toMatch(/k\.startsWith\("catan-"\)/);
  });
});
