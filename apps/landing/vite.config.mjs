import tailwindcss from "@tailwindcss/vite"
import {defineConfig} from "vite"

export default defineConfig({
  plugins: [tailwindcss()],
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    minify: 'terser',
    sourcemap: false,
  },
  server: {
    port: 3000,
  },
})
