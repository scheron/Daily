import {defineConfig} from "vitest/config"

export default defineConfig({
  test: {
    name: "@daily/tools",
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
})
