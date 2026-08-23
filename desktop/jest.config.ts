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
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
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
    // openclaw-chat.test.ts 使用 node:test 运行器（npx tsx --test），jest 会误报「至少一个测试」
    "<rootDir>/tests/unit/openclaw-chat.test.ts",
  ],
};

export default config;
