import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      ".venv/**",
      "**/coverage/**",
      "playwright-report/**",
      "test-results/**",
      "frontend/dist/**",
      "frontend/public/**",
      "course/**",
      "assets/**",
      "community_contributions/**",
      "docs/**",
      ".agents/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [js.configs.recommended, prettier],
    rules: {
      complexity: ["error", 15],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      jsxA11y.flatConfigs.recommended,
      prettier,
    ],
    rules: {
      complexity: ["error", 15],
    },
  },
);
