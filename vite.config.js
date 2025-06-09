import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import strip from "@rollup/plugin-strip"
import tailwindcss from "@tailwindcss/vite"
import vuePlugin from "@vitejs/plugin-vue"
import {visualizer} from "rollup-plugin-visualizer"
import {defineConfig} from "vite"
import compression from "vite-plugin-compression"

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, "src", "renderer")
const srcDir = join(rootDir, "src")

const isProduction = process.env.NODE_ENV === "production"

export default defineConfig({
  root: rootDir,
  publicDir: "public",
  base: "./",
  resolve: {
    alias: {
      "@": srcDir,
    },
  },
  server: {
    port: 8080,
  },
  open: false,
  build: {
    outDir: join(__dirname, "build", "renderer"),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    minify: "terser",
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks: {
          highlight: ["highlight.js"],
          markdown: ["markdown-it", "markdown-it-task-lists", "@mdit/plugin-img-size"],
          date: ["luxon"],
          "vue-vendor": ["vue", "@vueuse/core", "pinia"],
          "ui-vendor": ["vue-sonner", "clsx", "tailwind-merge"],
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name.endsWith(".woff2")) {
            return "assets/fonts/[name][extname]"
          }
          return "assets/[name]-[hash][extname]"
        },
        chunkFileNames: "assets/[name]-[hash].js",
      },
    },
    terserOptions: {
      compress: {
        drop_console: isProduction,
        drop_debugger: isProduction,
        pure_funcs: isProduction ? ["console.log", "console.info", "console.debug", "console.warn"] : [],
        dead_code: true,
        passes: 2,
      },
      mangle: {
        safari10: true,
      },
      format: {
        comments: false,
      },
    },
  },
  plugins: [
    vuePlugin(),
    tailwindcss(),

    isProduction &&
      strip({
        include: ["**/*.(vue|js|ts)"],
        functions: ["console.log", "console.info", "console.debug", "console.warn"],
        sourceMap: false,
      }),

    isProduction &&
      compression({
        algorithm: "gzip",
        ext: ".gz",
        threshold: 1024,
        deleteOriginFile: false,
        compressionOptions: {
          level: 9,
        },
      }),

    isProduction &&
      compression({
        algorithm: "brotliCompress",
        ext: ".br",
        threshold: 1024,
        deleteOriginFile: false,
      }),

    isProduction &&
      visualizer({
        filename: join(__dirname, "build", "renderer", "stats.html"),
        open: false,
        gzipSize: true,
        brotliSize: true,
        template: "treemap",
      }),
  ].filter(Boolean),

  optimizeDeps: {
    include: ["vue", "@vueuse/core", "pinia", "luxon", "highlight.js", "markdown-it"],
    exclude: ["@electron/rebuild"],
  },

  css: {
    devSourcemap: false,
  },
})
