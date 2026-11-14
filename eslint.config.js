import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
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
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      prettier,
    ],
  },
);
