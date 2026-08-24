import {defineConfig} from "vitest/config"

export default defineConfig({
  test: {
    name: "@daily/core",
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
})
