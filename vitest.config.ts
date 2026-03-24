import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {defineConfig} from "vitest/config"

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    silent: true,
    projects: [
      {
        test: {
          name: "main",
          environment: "node",
          include: ["tests/main/**/*.test.ts"],
        },
        resolve: {
          alias: {
            "@": join(__dirname, "src/main"),
            "@main": join(__dirname, "src/main"),
            "@shared": join(__dirname, "src/shared"),
          },
        },
      },
      {
        test: {
          name: "renderer",
          environment: "happy-dom",
          include: ["tests/renderer/**/*.test.ts"],
        },
        resolve: {
          alias: {
            "@": join(__dirname, "src/renderer/src"),
            "@renderer": join(__dirname, "src/renderer/src"),
            "@shared": join(__dirname, "src/shared"),
          },
        },
      },
      {
        test: {
          name: "shared",
          environment: "node",
          include: ["tests/shared/**/*.test.ts"],
        },
        resolve: {
          alias: {
            "@shared": join(__dirname, "src/shared"),
          },
        },
      },
    ],
  },
})
