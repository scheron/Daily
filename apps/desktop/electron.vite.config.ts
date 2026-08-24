import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {defineConfig, externalizeDepsPlugin} from "electron-vite"
import tsconfigPaths from "vite-tsconfig-paths"

import tailwindcss from "@tailwindcss/vite"
import vuePlugin from "@vitejs/plugin-vue"

const __dirname = dirname(fileURLToPath(import.meta.url))

const workspacePackages = ["@daily/protocol", "@daily/std", "@daily/core"]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({exclude: workspacePackages}), tsconfigPaths()],
    build: {
      outDir: "out/main",
      rollupOptions: {
        input: {
          main: join(__dirname, "src/main/app.ts"),
        },
      },
    },
  },

  preload: {
    plugins: [externalizeDepsPlugin({exclude: workspacePackages}), tsconfigPaths()],
    build: {
      outDir: "out/preload",
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
    build: {
      outDir: join(__dirname, "out/renderer"),
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
