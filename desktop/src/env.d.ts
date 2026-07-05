/// <reference types="vite/client" />

import type { ElectronAPI, RuntimeAPI } from '@shared/types'

declare global {
  interface Window {
    electronAPI: ElectronAPI
    runtime: RuntimeAPI
  }
}

// CSS Module 类型声明（用于 import styles from '*.module.css'）
declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}

export {}
