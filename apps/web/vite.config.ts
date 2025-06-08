import {dirname, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import tailwindcss from "@tailwindcss/vite"
import vue from "@vitejs/plugin-vue"
import {defineConfig} from "vite"



const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],

  base: "./",

  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
    extensions: [".mjs", ".js", ".ts", ".vue"],
  },
})
