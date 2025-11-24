import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vuePlugin from '@vitejs/plugin-vue'
import tsconfigPaths from 'vite-tsconfig-paths'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin(), 
      tsconfigPaths() 
    ],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          main: join(__dirname, 'src/main/app.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@': join(__dirname, 'src/main'),
        '@shared': join(__dirname, 'src/shared')
      }
    }
  },

  preload: {
    plugins: [
      externalizeDepsPlugin(),
      tsconfigPaths()
    ],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          preload: join(__dirname, 'src/main/preload.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    },
    resolve: {
      alias: {
        '@': join(__dirname, 'src/main'),
        '@shared': join(__dirname, 'src/shared')
      }
    }
  },

  renderer: {
    root: join(__dirname, 'src/renderer'),
    publicDir: 'public',
    resolve: {
      alias: {
        '@': join(__dirname, 'src/renderer/src'),
        '@shared': join(__dirname, 'src/shared')
      }
    },
    build: {
      outDir: join(__dirname, 'out/renderer'),
      emptyOutDir: true,
      sourcemap: false,
      chunkSizeWarningLimit: 1000
    },
    plugins: [
      vuePlugin(),
      tailwindcss(),
      tsconfigPaths()
    ],
    server: {
      port: 8080
    },
    optimizeDeps: {
      include: ['vue', '@vueuse/core', 'pinia', 'luxon', 'highlight.js', 'markdown-it'],
      exclude: ['@electron/rebuild']
    },
    css: {
      devSourcemap: false
    }
  }
})
