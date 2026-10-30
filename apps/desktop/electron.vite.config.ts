import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {defineConfig, externalizeDepsPlugin} from "electron-vite"
import tsconfigPaths from "vite-tsconfig-paths"

import tailwindcss from "@tailwindcss/vite"
import vuePlugin from "@vitejs/plugin-vue"

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDemo = process.env.DAILY_DEMO === "1"
const outputDirectory = isDemo ? "out-demo" : "out"

const workspacePackages = ["@daily/protocol", "@daily/std", "@daily/core", "@daily/tools"]

const mainAlias = {
  "@main": join(__dirname, "src/main"),
  "@shared": join(__dirname, "src/shared"),
}

const rendererAlias = {
  "@": join(__dirname, "src/renderer/src"),
  "@shared": join(__dirname, "src/shared"),
}

export default defineConfig({
  main: {
    define: {"process.env.DAILY_DEMO": JSON.stringify(isDemo ? "1" : "0")},
    plugins: [externalizeDepsPlugin({exclude: workspacePackages}), tsconfigPaths()],
    resolve: {alias: mainAlias},
    build: {
      outDir: `${outputDirectory}/main`,
      rollupOptions: {
        input: {
          main: join(__dirname, "src/main/app.ts"),
        },
      },
    },
  },

  preload: {
    plugins: [externalizeDepsPlugin({exclude: workspacePackages}), tsconfigPaths()],
    resolve: {alias: mainAlias},
    build: {
      outDir: `${outputDirectory}/preload`,
      rollupOptions: {
        input: {
          preload: join(__dirname, "src/main/preload.ts"),
        },
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
  },

  renderer: {
    root: join(__dirname, "src/renderer"),
    publicDir: "public",
    resolve: {alias: rendererAlias},
    build: {
      outDir: join(__dirname, outputDirectory, "renderer"),
      emptyOutDir: true,
      sourcemap: false,
      chunkSizeWarningLimit: 1000,
    },
    plugins: [vuePlugin(), tailwindcss(), tsconfigPaths()],
    server: {
      port: 8080,
    },
    optimizeDeps: {
      include: ["vue", "@vueuse/core", "pinia", "luxon", "highlight.js", "markdown-it"],
      exclude: ["@electron/rebuild"],
    },
    css: {
      devSourcemap: false,
    },
  },
})
