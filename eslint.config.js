import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "src-tauri",
      "playwright-report",
      "test-results",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // Transport seam: only src/api may call Tauri — everything else goes
      // through the Transport interface so IPC can later become REST.
      // Feature slices expose their root-level files as their public API —
      // cross-slice imports into a sibling's subdirectories are banned.
      "no-restricted-imports": [
        "error",
        {
          patterns: [{ group: ["@tauri-apps/*", "@/features/*/*/**"] }],
        },
      ],
    },
  },
  {
    // shared/ is the domain-agnostic layer: primitives, patterns, and
    // generic hooks never reach into api, labels, or the layers above
    // (layout, features, pages). no-restricted-imports does not merge
    // across config blocks, so the Tauri restriction is repeated here.
    files: ["src/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@tauri-apps/*",
                "@/api/**",
                "@/lib/labels",
                "@/features/**",
                "@/pages/**",
                "@/layout/**",
              ],
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/api/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["tests/smoke/**/*.ts"],
    languageOptions: {
      globals: { ...globals.mocha, browser: "readonly" },
    },
  },
);
