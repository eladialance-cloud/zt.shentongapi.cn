// Jest 配置文件
// 注意：Jest 及相关依赖未实际安装，此配置仅供未来安装后使用。
// 安装方法：npm install --save-dev jest @types/jest ts-jest jest-environment-jsdom
// 安装后运行：npm test 或 npm run test:e2e

import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@shared/(.*)$': '<rootDir>/electron/shared/$1'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
}

export default config
