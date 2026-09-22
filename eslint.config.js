import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      /* Хуки вне компонента или под условием ломают состояние — это ошибка */
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      /* Подчёркивание — явный знак «параметр не нужен» */
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
  {
    /* Тесты и конфиги выполняются в node */
    files: ["src/**/*.test.ts", "src/test/**", "*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
  {
    /* Серверные функции Vercel: node плюс веб-примитивы Request и Response */
    files: ["api/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node, Response: "readonly", Request: "readonly" },
    },
  },
);
