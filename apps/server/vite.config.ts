import {createRequire} from "node:module"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {defineConfig} from "vite"

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const pkg = require("./package.json")
const external = [/^node:/, ...Object.keys(pkg.dependencies ?? {}).filter((name) => !name.startsWith("@daily/"))]

export default defineConfig({
  build: {
    outDir: join(__dirname, "out"),
    emptyOutDir: true,
    minify: false,
    target: "node22",
    lib: {
      entry: {
        index: join(__dirname, "src/index.ts"),
        searchWorker: join(__dirname, "src/agents/search/searchWorker.ts"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {external, output: {banner: (chunk) => (chunk.name === "index" ? "#!/usr/bin/env node" : "")}},
  },
})
