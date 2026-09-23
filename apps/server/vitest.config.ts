import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {defineConfig} from "vitest/config"

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@core": join(__dirname, "../../packages/core/src"),
      "@server-tests": join(__dirname, "tests"),
    },
  },
  test: {
    name: "@daily/server",
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
})
