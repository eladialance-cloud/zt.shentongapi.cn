import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { loadEnv } from 'vite'

const env = loadEnv(process.env.NODE_ENV === 'production' ? 'production' : 'development', process.cwd(), '')

// H-11 修复：禁止 dev 模式隐式回退到生产 URL
if (!env.VITE_API_BASE_URL) {
  throw new Error(`VITE_API_BASE_URL 未设置，mode=${process.env.NODE_ENV || 'development'}。请检查 .env.development 文件。`)
}

// H-08 升级 Electron 31→41 / vite 5→8 / electron-vite 2→5 后修复：
// vite@8 的 rolldown 严格解析所有 import，包括 native 模块的传递依赖。
// H-08b 升级 @journeyapps/sqlcipher 5.3.1→6.0.0 后：
//   - 6.0.0 移除了 @mapbox/node-pre-gyp（及其 mock-aws-s3/aws-sdk/nock/npmlog/rimraf
//     等可选依赖链，该链通过 tar@6.2.1 引入 6 个路径穿越 CVE）
//   - 6.0.0 改用 bindings + node-addon-api（node-gyp 源码编译方式）
// 这里把 native 模块及其传递依赖声明为 external，与 vite@5 旧行为保持一致。
const nativeModuleOptionalDeps = [
  'bindings',
  'node-addon-api',
  '@journeyapps/sqlcipher'
]

// FIX: 把 Electron 内置模块声明为 external，防止打包时把 npm 上的 electron 包
// （下载器包装脚本）一起 bundle 进 dist/main/index.js，导致已安装应用启动时报
// "Electron failed to install correctly, please delete node_modules/electron..."
const electronBuiltins = ['electron']

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
        external: [...nativeModuleOptionalDeps, ...electronBuiltins]
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
        external: [...nativeModuleOptionalDeps, ...electronBuiltins]
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    // Office 等距 2.5D PNG 素材位于项目根目录 public/assets/office/iso，
    // 需要显式指定 publicDir，否则 vite 默认从 src/public 读取。
    publicDir: resolve(__dirname, 'public'),
    plugins: [react()],
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
          // H-08 修复：vite@8 的 rolldown 要求 manualChunks 为函数（vite@5 的 rollup 允许对象形式）
          manualChunks: (id: string) => {
            if (!id.includes('node_modules')) {
              return undefined
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
