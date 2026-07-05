import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { loadEnv } from 'vite'

const env = loadEnv(process.env.NODE_ENV === 'production' ? 'production' : 'development', process.cwd(), '')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main/index.ts') },
        output: {
          dir: 'dist/main',
          entryFileNames: '[name].js',
          format: 'cjs'
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload/index.ts') },
        output: {
          dir: 'dist/preload',
          entryFileNames: '[name].js',
          format: 'cjs'
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    },
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(env.VITE_API_BASE_URL || 'http://localhost:3001/api')
    },
    build: {
      outDir: resolve(__dirname, 'dist/renderer'),
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/index.html') }
      }
    }
  }
})
