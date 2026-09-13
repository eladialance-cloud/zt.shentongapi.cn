// Jest 配置文件
// 注意：Jest 及相关依赖未实际安装，此配置仅供未来安装后使用。
// 安装方法：npm install --save-dev jest @types/jest ts-jest jest-environment-jsdom
// 安装后运行：npm test 或 npm run test:e2e

import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { jsx: "react-jsx", esModuleInterop: true, allowSyntheticDefaultImports: true } }],
  },
  testEnvironment: "jsdom",
  testMatch: ["<rootDir>/tests/**/*.test.{ts,tsx}"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@shared/(.*)$": "<rootDir>/electron/shared/$1",
    "\\.module\\.css$": "<rootDir>/tests/unit/css-stub.ts",
  },
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  modulePathIgnorePatterns: [
    // runtime 目录是下载/解压产物，含 node/python 运行时，无需 jest 扫描
    "<rootDir>/runtime/",
  ],
  testPathIgnorePatterns: [
    // 以下三个用例走 node:test 运行器（npx tsx --test tests/unit/<文件名>），jest 跑不了：node:test 文件会报「至少一个测试」，hermes-chat.test.ts 在 jsdom 环境缺 TextEncoder。2026-09-13 实测 tsx 下分别 13/8/6 全过。
    "<rootDir>/tests/unit/hermes-chat.test.ts",
    "<rootDir>/tests/unit/hermes-chat-pipeline.test.ts",
    "<rootDir>/tests/unit/hermes-mcp-sync.test.ts",
  ],
};

export default config;
