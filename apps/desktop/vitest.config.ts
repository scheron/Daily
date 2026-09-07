import tsconfigPaths from "vite-tsconfig-paths"
import {defineConfig} from "vitest/config"

import vue from "@vitejs/plugin-vue"

export default defineConfig({
  plugins: [vue(), tsconfigPaths()],
  test: {
    name: "@daily/desktop",
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
  },
})
