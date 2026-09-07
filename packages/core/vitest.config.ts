import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {defineConfig} from "vitest/config"

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {alias: {"@core": join(__dirname, "src")}},
  test: {
    name: "@daily/core",
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
})
