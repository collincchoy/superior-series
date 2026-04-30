// @ts-check
/**
 * ESLint flat config — `*.svelte` only.
 *
 * Oxlint already lints `<script>` blocks in `.svelte` files; it does not lint
 * markup, so `<Foo />` without `import Foo` is not caught there.
 *
 * `eslint-plugin-svelte` + `no-undef` covers component references in templates.
 * `svelte.configs.recommended` is intentionally omitted until we opt in file‑by‑file.
 */
import tsParser from "@typescript-eslint/parser";
import svelte from "eslint-plugin-svelte";
import globals from "globals";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: ["dist/**", "node_modules/**", ".astro/**"],
  },
  ...svelte.configs.base,
  {
    files: ["**/*.svelte"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: [".svelte"],
      },
    },
    rules: {
      "no-undef": "error",
    },
  },
];
