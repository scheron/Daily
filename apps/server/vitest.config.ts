import {defineConfig} from "vitest/config"

export default defineConfig({
  test: {
    name: "@daily/server",
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
})
