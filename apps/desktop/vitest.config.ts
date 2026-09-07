import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import tsconfigPaths from "vite-tsconfig-paths"
import {defineConfig} from "vitest/config"

import vue from "@vitejs/plugin-vue"

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue(), tsconfigPaths()],
  resolve: {
    alias: {
      "@main": join(__dirname, "src/main"),
      "@shared": join(__dirname, "src/shared"),
      "@": join(__dirname, "src/renderer/src"),
    },
  },
  test: {
    name: "@daily/desktop",
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
  },
})
