import {defineConfig} from "vitest/config"

export default defineConfig({
  test: {
    name: "@daily/cli-app",
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
})
