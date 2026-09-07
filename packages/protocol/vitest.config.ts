import {defineConfig} from "vitest/config"

export default defineConfig({
  test: {
    name: "@daily/protocol",
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
})
