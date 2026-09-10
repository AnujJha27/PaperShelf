import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/.venv/**", "**/coverage/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ["**/*.ts", "**/*.tsx"], rules: { "no-unused-vars": "off", "@typescript-eslint/no-unused-vars": "warn", "@typescript-eslint/no-explicit-any": "off" } },
  { files: ["apps/web/public/sw.js"], languageOptions: { globals: { self: "readonly", caches: "readonly", URL: "readonly", fetch: "readonly" } } },
);
