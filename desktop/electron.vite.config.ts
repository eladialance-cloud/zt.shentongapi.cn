import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { loadEnv } from 'vite'

const env = loadEnv(process.env.NODE_ENV === 'production' ? 'production' : 'development', process.cwd(), '')

// H-11 fix: prevent dev mode from silently falling back to production URL
if (!env.VITE_API_BASE_URL) {
  throw new Error(`VITE_API_BASE_URL not set, mode=${process.env.NODE_ENV || 'development'}. Check .env.development file.`)
}

// H-08 upgrade Electron 31->41 / vite 5->8 / electron-vite 2->5 fix:
// vite@8's rolldown strictly resolves all imports, including native module transitive deps.
// S-45（2026-09-13 定稿，方案 A）：本产品不做本地加密库，package.json 已移除 @journeyapps/sqlcipher。
// 主进程 local-db 仍保留 try/catch require → 生产构建下必然走降级路径（本地读写回退云端 API）。
// 这里必须继续把它列为 external：rolldown 对字符串字面量 require() 会尝试解析，
// 一旦试图打包就会直接构建失败（该模块在 node_modules 里本就不存在）。
const optionalNativeModules = [
  '@journeyapps/sqlcipher'
]

// electron is in devDependencies, externalizeDepsPlugin won't auto-externalize it
// but main process code (e.g. electron-log) will require('electron'), so must exclude during build
const electronExternalDeps = [
  'electron',
  'electron-updater',
  ...optionalNativeModules
]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      'process.env.VITE_API_BASE_URL': JSON.stringify(env.VITE_API_BASE_URL)
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main/index.ts') },
        output: {
          dir: 'dist/main',
          entryFileNames: '[name].js',
          format: 'cjs'
        },
        external: electronExternalDeps
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
        },
        external: electronExternalDeps
      }
    }
  },
  renderer: {
    optimizeDeps: {
      exclude: ['@ant-design/colors'],
      include: ['pixi.js', 'eventemitter3', '@esotericsoftware/spine-pixi-v8'],
      force: true,
    },
    root: resolve(__dirname, 'src'),
    publicDir: resolve(__dirname, 'public'),
    // K14 fix: Electron file:// protocol requires relative paths, not absolute '/' pointing to disk root
    base: './',
    plugins: [
      react(),
      {
        // dev mode CSP relaxation: Vite injects React HMR inline preamble script in dev mode,
        // but index.html's CSP script-src 'self' blocks this inline script,
        // causing @vitejs/plugin-react to throw "can't detect preamble" and crash the React app.
        // This plugin only in dev mode (apply: 'serve') relaxes script-src 'self' to 'self' 'unsafe-inline',
        // does not affect production build (production CSP keeps 'self' strict policy).
        name: 'dev-csp-unsafe-inline',
        apply: 'serve' as const,
        transformIndexHtml(html: string) {
          // only replace first occurrence of script-src 'self'; avoid affecting other CSP directives
          return html.replace(
            "script-src 'self';",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval';"
          )
        }
      },
      {
        // Fix: Vite 8 adds crossorigin to <link rel="stylesheet">; Electron file:// drops stylesheet => naked HTML.
        name: 'strip-css-crossorigin',
        apply: 'build' as const,
        transformIndexHtml(html: string) {
          return html.replace(
            /(<link\s+[^>]*rel="stylesheet"[^>]*?)\s+crossorigin(=[^\s>]*)?(\s[^>]*>)/g,
            '$1$3'
          )
        }
      }
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'electron/shared')
      }
    },
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(env.VITE_API_BASE_URL)
    },
    build: {
      outDir: resolve(__dirname, 'dist/renderer'),
      emptyOutDir: true,
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/index.html') },
        output: {
          // H-08 fix: vite@8's rolldown requires manualChunks as function (vite@5's rollup allowed object form)
          manualChunks: (id: string) => {
            if (!id.includes('node_modules')) {
              return undefined
            }
            if (id.includes('/pixi.js/') || id.includes('/@pixi/') || id.includes('/@esotericsoftware/spine-pixi-v8/')) {
              return 'vendor-pixi'
            }
            if (id.includes('/react-router-dom/') || id.includes('/react-dom/') || id.includes('/react/')) {
              return 'vendor-react'
            }
            if (id.includes('/antd/') || id.includes('/@ant-design/icons/')) {
              return 'vendor-antd'
            }
            if (id.includes('/axios/') || id.includes('/dayjs/') || id.includes('/zustand/')) {
              return 'vendor-utils'
            }
            return undefined
          }
        }
      }
    }
  }
})
