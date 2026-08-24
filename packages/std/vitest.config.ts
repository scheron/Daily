import {defineConfig} from "vitest/config"

export default defineConfig({
  test: {
    name: "@daily/std",
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
})
