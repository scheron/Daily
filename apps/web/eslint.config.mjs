import * as vueParser from "vue-eslint-parser";
import tseslint from "@typescript-eslint/eslint-plugin";
import typescript from "@typescript-eslint/parser";
import eslintConfigPrettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import unusedImports from "eslint-plugin-unused-imports";
import vue from "eslint-plugin-vue";

export default [
  eslintConfigPrettier,
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    ignores: ["dist/**", "node_modules/**"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: [
      "dist/**",
      "node_modules/**",
      "*.config.*",
      "components.d.ts",
      "auto-imports.d.ts",
    ],
    languageOptions: {
      parser: typescript,
      parserOptions: {
        project: true,
        ecmaVersion: "latest",
        sourceType: "module",
        tsconfigRootDir: process.cwd(),
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      import: importPlugin,
      "unused-imports": unusedImports,
    },
    rules: {
      "no-undef": "off",
      "no-return-assign": "error",
      "no-extra-semi": "off",
      "prefer-destructuring": "off",
      "lines-between-class-members": [
        "error",
        "always",
        { exceptAfterSingleLine: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      "no-console": "off",
      "no-debugger": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "separate-type-imports",
        },
      ],
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: typescript,
        extraFileExtensions: [".vue"],
        ecmaVersion: "latest",
        sourceType: "module",
        tsconfigRootDir: process.cwd(),
      },
    },
    plugins: {
      vue,
      "@typescript-eslint": tseslint,
      import: importPlugin,
    },
    rules: {
      "vue/multi-word-component-names": "off",
      "vue/block-order": [
        "error",
        {
          order: [
            "script:not([setup])",
            "script[setup]",
            "template",
            "style:not([scoped])",
            "style[scoped]",
          ],
        },
      ],
      "vue/attributes-order": [
        "error",
        {
          order: [
            "DEFINITION",
            "LIST_RENDERING",
            "CONDITIONALS",
            "RENDER_MODIFIERS",
            "GLOBAL",
            "UNIQUE",
            "TWO_WAY_BINDING",
            "OTHER_DIRECTIVES",
            "OTHER_ATTR",
            "EVENTS",
            "CONTENT",
          ],
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
];
