import {createRequire} from "node:module"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {defineConfig} from "vite"

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const pkg = require("./package.json")
const external = [/^node:/, ...Object.keys(pkg.dependencies ?? {})]

export default defineConfig({
  resolve: {
    alias: {
      "@": join(__dirname, "src/main"),
      "@shared": join(__dirname, "src/shared"),
      "@cli": join(__dirname, "src/cli"),
    },
  },
  build: {
    outDir: "out/cli",
    emptyOutDir: true,
    minify: false,
    target: "node22",
    lib: {entry: join(__dirname, "src/cli/index.ts"), formats: ["es"], fileName: () => "index.js"},
    rollupOptions: {external, output: {banner: "#!/usr/bin/env node"}},
  },
})
