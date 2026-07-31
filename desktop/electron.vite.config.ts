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
// H-08b upgrade @journeyapps/sqlcipher 5.3.1->6.0.0:
//   - 6.0.0 removed @mapbox/node-pre-gyp (and its mock-aws-s3/aws-sdk/nock/npmlog/rimraf
//     optional dep chain, which introduced 6 path traversal CVEs via tar@6.2.1)
//   - 6.0.0 uses bindings + node-addon-api (node-gyp source compile)
// Declare native modules and their transitive deps as external, consistent with vite@5 behavior.
const nativeModuleOptionalDeps = [
  'bindings',
  'node-addon-api',
  '@journeyapps/sqlcipher'
]

// electron is in devDependencies, externalizeDepsPlugin won't auto-externalize it
// but main process code (e.g. electron-log) will require('electron'), so must exclude during build
const electronExternalDeps = [
  'electron',
  'electron-updater',
  ...nativeModuleOptionalDeps
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
    root: resolve(__dirname, 'src'),
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
            "script-src 'self' 'unsafe-inline';"
          )
        }
      }
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
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
            if (id.includes('/pixi.js/') || id.includes('/@pixi/')) {
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
