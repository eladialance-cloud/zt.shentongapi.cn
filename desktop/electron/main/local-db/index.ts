// 本地数据库服务（SQLite + SQLCipher 加密）
// 单例模式；初始化失败时降级，所有操作回退到云端 API
//
// 说明：@journeyapps/sqlcipher 是 node-sqlite3 的异步回调分支（非 better-sqlite3 同步 API）。
// 因此 exec / transaction 返回 Promise；prepare / close / isDegraded 保持同步语义。
// prepare 在 node-sqlite3 中同步返回 Statement 对象，符合预期。

import { app } from 'electron'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { SCHEMA_SQL } from './schema'
import { validateKey } from './crypto'
import {
  buildLocalDbStatus,
  sanitizeDegradedReason,
  type LocalDbDegradedCode,
  type LocalDbStatus,
} from '../../shared/local-db-status'

// S-45（2026-09-13 定稿，方案 A）：本产品不做本地加密库 —— package.json 已移除
// @journeyapps/sqlcipher，安装包里也不再带 stub / prebuilt binary，因此下面这段 require
// 在生产构建里必然抛 MODULE_NOT_FOUND。保留 try/catch 是为了让「降级」是预期路径而非启动崩溃：
// 加载失败 → handleDegradation → 本地 DB 操作抛 DBDegradedException → 渲染层回退云端 API。
// 类型来自 types/sqlcipher.d.ts（经 tsconfig.node.json 的 paths 映射），与运行时是否存在无关。
let sqlite3: typeof import('@journeyapps/sqlcipher') | null = null
try {
  sqlite3 = require('@journeyapps/sqlcipher')
} catch (err) {
  console.warn('[local-db] @journeyapps/sqlcipher not available, will use degraded mode:', err)
}

/** 降级模式下抛出的异常，渲染进程据此走云端 API */
export class DBDegradedException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DBDegradedException'
    Object.setPrototypeOf(this, DBDegradedException.prototype)
  }
}

/** 数据库运行结果（lastID + changes） */
export interface RunResult {
  lastID: number
  changes: number
}

class LocalDbService extends EventEmitter {
  private static instance: LocalDbService | null = null

  private db: import('@journeyapps/sqlcipher').Database | null = null
  private degraded = false
  private initialized = false
  // 安全审计 S-45：降级不能只有一个布尔值，必须带原因（渲染层要能告诉用户为什么）
  private degradedCode: LocalDbDegradedCode | null = null
  private degradedReason: string | null = null
  private degradedAt: string | null = null

  private constructor() {
    super()
  }

  /** 获取单例 */
  static getInstance(): LocalDbService {
    if (!LocalDbService.instance) {
      LocalDbService.instance = new LocalDbService()
    }
    return LocalDbService.instance
  }

  /** 是否处于降级模式 */
  isDegraded(): boolean {
    return this.degraded
  }

  /** 是否已初始化 */
  isInitialized(): boolean {
    return this.initialized
  }

  /** 本地库状态（安全审计 S-45）：含降级原因码 / 脱敏详情 / 首次降级时间 */
  getStatus(): LocalDbStatus {
    return buildLocalDbStatus({
      degraded: this.degraded,
      initialized: this.initialized,
      moduleAvailable: Boolean(sqlite3),
      code: this.degradedCode,
      reason: this.degradedReason,
      degradedAt: this.degradedAt,
    })
  }

  /**
   * 启动自检（安全审计 S-45）：不必等登录，先把「本构建有没有本地加密库」定下来。
   * 缺原生模块时立即登记降级（渲染层启动即可读到，而不是登录后才发现），并打一行明确日志。
   */
  selfCheck(): LocalDbStatus {
    if (!sqlite3) {
      this.handleDegradation(
        new Error('@journeyapps/sqlcipher module not available in this build'),
        'MODULE_UNAVAILABLE',
      )
    }
    return this.getStatus()
  }

  /**
   * 初始化数据库（登录后调用）
   * 使用 SQLCipher 加密；失败时进入降级模式并触发 db:degraded 事件
   * @param encryptionKey 64 字符 hex 密钥（由 PBKDF2 派生）
   */
  async initialize(encryptionKey: string): Promise<void> {
    // 已初始化且未降级则跳过
    if (this.initialized && this.db && !this.degraded) {
      return
    }

    // 如果 sqlcipher 模块不可用，直接进入降级模式
    if (!sqlite3) {
      this.handleDegradation(
        new Error('@journeyapps/sqlcipher module not available in this build'),
        'MODULE_UNAVAILABLE',
      )
      return
    }

    // 失败阶段标记（安全审计 S-45）：每个可能失败的步骤都先写 stage，catch 时据此给出原因码
    let stage: LocalDbDegradedCode = 'OPEN_FAILED'

    try {
      if (!validateKey(encryptionKey)) {
        stage = 'INVALID_KEY'
        throw new Error('Invalid encryption key format (expected 64-char hex)')
      }

      const dbPath = join(app.getPath('userData'), 'local.db')
      stage = 'OPEN_FAILED'
      this.db = new sqlite3.Database(dbPath)

      // SQLCipher：使用 PBKDF2 已派生的原始密钥（避免二次派生）
      // 以 x'<hex>' 形式传入，SQLCipher 直接将其作为 32 字节原始密钥
      stage = 'KEY_MISMATCH'
      await this.runInternal(`PRAGMA key = "x'${encryptionKey}'"`)
      await this.runInternal('PRAGMA cipher_compatibility = 4')

      // 校验密钥：错误密钥下读取 sqlite_master 会抛错
      await this.verifyKey()

      // 建表
      stage = 'SCHEMA_FAILED'
      await this.execInternal(SCHEMA_SQL)

      this.initialized = true
      this.degraded = false
      this.degradedCode = null
      this.degradedReason = null
      this.degradedAt = null
    } catch (err) {
      this.handleDegradation(err, stage)
    }
  }

  /** 关闭数据库连接（登出时调用）— 同步语义，内部异步关闭 */
  close(): void {
    if (this.db) {
      try {
        this.db.close()
      } catch (err) {
        console.error('[local-db] close error:', err)
      }
      this.db = null
    }
    this.initialized = false
    // close 是正常关闭，不触发降级
  }

  /**
   * 执行 SQL（可多条）— 异步
   * 降级模式下抛出 DBDegradedException
   */
  async exec(sql: string): Promise<void> {
    this.ensureReady()
    await this.execInternal(sql)
  }

  /**
   * 准备语句 — 同步返回 Statement
   * 降级模式下抛出 DBDegradedException
   */
  prepare(sql: string): import('@journeyapps/sqlcipher').Statement {
    this.ensureReady()
    // node-sqlite3 的 prepare 同步返回 Statement 对象
    return this.db!.prepare(sql)
  }

  /**
   * 事务包装 — 异步
   * 降级模式下抛出 DBDegradedException
   * @param fn 事务体，返回 Promise；抛错则回滚
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    this.ensureReady()
    await this.runInternal('BEGIN TRANSACTION')
    try {
      const result = await fn()
      await this.runInternal('COMMIT')
      return result
    } catch (err) {
      // 回滚失败不应掩盖原始错误
      try {
        await this.runInternal('ROLLBACK')
      } catch (rollbackErr) {
        console.error('[local-db] rollback failed:', rollbackErr)
      }
      throw err
    }
  }

  // -------- 便捷查询方法（供后续 Repository 使用） --------

  /** 执行写操作（INSERT/UPDATE/DELETE），返回 lastID / changes */
  async run(sql: string, params: unknown[] = []): Promise<RunResult> {
    this.ensureReady()
    return this.runInternal(sql, params)
  }

  /** 查询单行 */
  async get<T = unknown>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    this.ensureReady()
    return this.getInternal<T>(sql, params)
  }

  /** 查询多行 */
  async all<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    this.ensureReady()
    return this.allInternal<T>(sql, params)
  }

  // -------- 内部实现 --------

  private ensureReady(): void {
    if (this.degraded) {
      throw new DBDegradedException('Database is in degraded mode, fallback to cloud API')
    }
    if (!this.db || !this.initialized) {
      throw new DBDegradedException('Database is not initialized')
    }
  }

  private async verifyKey(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.db) {
        reject(new DBDegradedException('Database handle is null'))
        return
      }
      this.db.get('SELECT count(*) AS c FROM sqlite_master', (err) => {
        if (err) {
          reject(new Error(`SQLCipher key verification failed: ${err.message}`))
        } else {
          resolve()
        }
      })
    })
  }

  private runInternal(sql: string, params: unknown[] = []): Promise<RunResult> {
    return new Promise<RunResult>((resolve, reject) => {
      if (!this.db) {
        reject(new DBDegradedException('Database handle is null'))
        return
      }
      this.db.run(sql, params, function (this: import('@journeyapps/sqlcipher').RunResult, err: Error | null) {
        if (err) {
          reject(err)
        } else {
          resolve({ lastID: this.lastID, changes: this.changes })
        }
      })
    })
  }

  private execInternal(sql: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.db) {
        reject(new DBDegradedException('Database handle is null'))
        return
      }
      this.db.exec(sql, (err: Error | null) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  private getInternal<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve, reject) => {
      if (!this.db) {
        reject(new DBDegradedException('Database handle is null'))
        return
      }
      this.db.get(sql, params, (err: Error | null, row: T | undefined) => {
        if (err) reject(err)
        else resolve(row)
      })
    })
  }

  private allInternal<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return new Promise<T[]>((resolve, reject) => {
      if (!this.db) {
        reject(new DBDegradedException('Database handle is null'))
        return
      }
      this.db.all(sql, params, (err: Error | null, rows: T[]) => {
        if (err) reject(err)
        else resolve(rows ?? [])
      })
    })
  }

  /**
   * 降级处理：记录原因、关闭句柄、标记降级、触发事件
   * 渲染进程监听 db:degraded 后所有操作走云端 API
   *
   * 安全审计 S-45：原因码 / 脱敏详情 / 首次降级时间一并留存，供渲染层显示；
   * 日志与广播**只在该次降级的第一次**产生（重复 initialize 不再刷屏）。
   */
  private handleDegradation(err: unknown, code: LocalDbDegradedCode = 'UNKNOWN'): void {
    const first = !this.degraded
    const reason = sanitizeDegradedReason(err)
    this.degraded = true
    this.initialized = false
    this.degradedCode = code
    this.degradedReason = reason
    if (!this.degradedAt) this.degradedAt = new Date().toISOString()
    if (this.db) {
      try {
        this.db.close()
      } catch {
        // 忽略关闭错误
      }
      this.db = null
    }
    if (first) {
      console.warn(
        '[local-db] 已进入降级模式（' + code + '）：' + (reason ?? 'unknown') +
          '；本地加密库不可用，数据不落本机，读写改走云端 API',
      )
      console.error('[local-db] 降级根因（仅主进程日志）:', err)
      // 通知主进程转发给渲染进程
      this.emit('db:degraded', {
        code,
        message: reason ?? 'local db degraded',
        status: this.getStatus(),
      })
    }
  }
}

/** 本地数据库单例 */
export const localDb = LocalDbService.getInstance()
