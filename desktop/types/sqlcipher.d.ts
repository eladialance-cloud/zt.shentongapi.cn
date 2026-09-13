// Type definitions for @journeyapps/sqlcipher —— 本仓库自行维护的类型声明（非 node_modules 副本）
//
// S-45（2026-09-13 定稿，方案 A）：本产品不做本地加密库，package.json 不再声明该依赖，
// 因此 electron/main/local-db 中的 typeof import('@journeyapps/sqlcipher') 只能靠
// tsconfig.node.json 的 paths 映射（"@journeyapps/sqlcipher": ["./types/sqlcipher.d.ts"]）解析到本文件。
// 运行时该模块并不存在（try/catch require 失败 → 降级走云端），本文件只解决编译期类型。

/// <reference types="node" />

import events = require("events");

export const OPEN_READONLY: number;
export const OPEN_READWRITE: number;
export const OPEN_CREATE: number;
export const OPEN_SHAREDCACHE: number;
export const OPEN_PRIVATECACHE: number;
export const OPEN_URI: number;

export const cached: {
    Database(filename: string, callback?: (this: Database, err: Error | null) => void): Database;
    Database(filename: string, mode?: number, callback?: (this: Database, err: Error | null) => void): Database;
};

export interface RunResult extends Statement {
    lastID: number;
    changes: number;
}

export class Statement {
    bind(callback?: (err: Error | null) => void): this;
    bind(...params: any[]): this;

    reset(callback?: (err: null) => void): this;

    finalize(callback?: (err: Error) => void): Database;

    run(callback?: (err: Error | null) => void): this;
    run(params: any, callback?: (this: RunResult, err: Error | null) => void): this;
    run(...params: any[]): this;

    get(callback?: (err: Error | null, row?: any) => void): this;
    get(params: any, callback?: (this: RunResult, err: Error | null, row?: any) => void): this;
    get(...params: any[]): this;

    all(callback?: (err: Error | null, rows: any[]) => void): this;
    all(params: any, callback?: (this: RunResult, err: Error | null, rows: any[]) => void): this;
    all(...params: any[]): this;

    each(callback?: (err: Error | null, row: any) => void, complete?: (err: Error | null, count: number) => void): this;
    each(params: any, callback?: (this: RunResult, err: Error | null, row: any) => void, complete?: (err: Error | null, count: number) => void): this;
    each(...params: any[]): this;
}

export class Database extends events.EventEmitter {
    constructor(filename: string, callback?: (err: Error | null) => void);
    constructor(filename: string, mode?: number, callback?: (err: Error | null) => void);

    close(callback?: (err: Error | null) => void): void;

    run(sql: string, callback?: (this: RunResult, err: Error | null) => void): this;
    run(sql: string, params: any, callback?: (this: RunResult, err: Error | null) => void): this;
    run(sql: string, ...params: any[]): this;

    get(sql: string, callback?: (this: Statement, err: Error | null, row: any) => void): this;
    get(sql: string, params: any, callback?: (this: Statement, err: Error | null, row: any) => void): this;
    get(sql: string, ...params: any[]): this;

    all(sql: string, callback?: (this: Statement, err: Error | null, rows: any[]) => void): this;
    all(sql: string, params: any, callback?: (this: Statement, err: Error | null, rows: any[]) => void): this;
    all(sql: string, ...params: any[]): this;

    each(sql: string, callback?: (this: Statement, err: Error | null, row: any) => void, complete?: (err: Error | null, count: number) => void): this;
    each(sql: string, params: any, callback?: (this: Statement, err: Error | null, row: any) => void, complete?: (err: Error | null, count: number) => void): this;
    each(sql: string, ...params: any[]): this;

    exec(sql: string, callback?: (this: Statement, err: Error | null) => void): this;

    prepare(sql: string, callback?: (this: Statement, err: Error | null) => void): Statement;
    prepare(sql: string, params: any, callback?: (this: Statement, err: Error | null) => void): Statement;
    prepare(sql: string, ...params: any[]): Statement;

    serialize(callback?: () => void): void;
    parallelize(callback?: () => void): void;

    on(event: "trace", listener: (sql: string) => void): this;
    on(event: "profile", listener: (sql: string, time: number) => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "open" | "close", listener: () => void): this;
    on(event: string, listener: (...args: any[]) => void): this;

    configure(option: "busyTimeout", value: number): void;
    interrupt(): void;
}

export function verbose(): sqlite3;

export interface sqlite3 {
    OPEN_READONLY: number;
    OPEN_READWRITE: number;
    OPEN_CREATE: number;
    OPEN_SHAREDCACHE: number;
    OPEN_PRIVATECACHE: number;
    OPEN_URI: number;
    cached: typeof cached;
    RunResult: RunResult;
    Statement: typeof Statement;
    Database: typeof Database;
    verbose(): this;
}
