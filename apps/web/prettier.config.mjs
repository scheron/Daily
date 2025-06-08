import baseConfig from "@daily/config/prettier";

export default {
  ...baseConfig,
  importOrderParserPlugins: ["typescript"],
  importOrderTypeScriptVersion: "5.0.0",
  plugins: ["@ianvs/prettier-plugin-sort-imports"],
  importOrder: [
    "^@daily/(.*)$",
    "",
    "^vue$",
    "^vue-(.*)$",
    "^@vueuse/(.*)$",
    "<THIRD_PARTY_MODULES>",
    "",
    "^@/api(.*)$",
    "^@/utils(.*)$",
    "^@/constants(.*)$",
    "^@/composables(.*)$",
    "^@/stores(.*)$",
    "^@/ui(.*)$",
    "^(?!.*)[./].*$",
    "^[./]",
    "",
    "<TYPES>",
    "<TYPES>^[.]",
  ],
};
