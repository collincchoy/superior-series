// @ts-check
import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";

// https://astro.build/config
export default defineConfig({
  site: "https://collincchoy.github.io/superior-series/",
  base: "/superior-series/",
  integrations: [svelte()],
  vite: {
    build: {
      // Vite 7 defaults to safari16, and old iPads (iPadOS 13–15) can't parse
      // that output (class fields, `??=`): the page loads blank. Lower the
      // syntax so they can run it. Floor is Safari 13.1, because Astro's
      // prebuilt island loader uses `?.`.
      target: ["es2019", "safari13"],
    },
    optimizeDeps: {
      include: ["qrcode"],
    },
  },
});
