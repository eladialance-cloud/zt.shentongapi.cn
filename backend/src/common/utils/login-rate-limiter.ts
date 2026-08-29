/**
 * 登录失败限流（进程内实现，单实例部署可用）
 * - 同一 IP + 账号连续失败 5 次 → 锁定 15 分钟
 * - 同一 IP 累计失败 20 次 → 锁定 15 分钟
 * - 登录成功清除该 IP+账号 的失败计数
 * 阈值可通过环境变量覆盖：LOGIN_FAIL_LIMIT / LOGIN_IP_FAIL_LIMIT / LOGIN_LOCK_MINUTES
 */
import { HttpException, HttpStatus } from '@nestjs/common';

interface RateRecord {
  failCount: number;
  lockUntil: number;
  updatedAt: number;
}

const DEFAULT_FAIL_LIMIT = 5;
const DEFAULT_IP_FAIL_LIMIT = 20;
const DEFAULT_LOCK_MS = 15 * 60 * 1000;
const MAX_RECORDS = 50000;
const CLEANUP_EVERY = 1000;

class LoginRateLimiter {
  private readonly store = new Map<string, RateRecord>();
  private ops = 0;

  private get failLimit(): number {
    const v = Number(process.env.LOGIN_FAIL_LIMIT);
    return Number.isFinite(v) && v > 0 ? Math.trunc(v) : DEFAULT_FAIL_LIMIT;
  }

  private get ipFailLimit(): number {
    const v = Number(process.env.LOGIN_IP_FAIL_LIMIT);
    return Number.isFinite(v) && v > 0 ? Math.trunc(v) : DEFAULT_IP_FAIL_LIMIT;
  }

  private get lockMs(): number {
    const v = Number(process.env.LOGIN_LOCK_MINUTES);
    return Number.isFinite(v) && v > 0 ? Math.trunc(v) * 60 * 1000 : DEFAULT_LOCK_MS;
  }

  /** 进入登录前检查：已锁定则抛 429 */
  assertNotLocked(ip: string, account: string): void {
    const now = Date.now();
    for (const key of [this.accountKey(ip, account), this.ipKey(ip)]) {
      const rec = this.store.get(key);
      if (rec && rec.lockUntil > now) {
        throw new HttpException('登录尝试过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
      }
    }
  }

  /** 登录失败：按账号与 IP 分别计数，达到阈值触发锁定 */
  recordFailure(ip: string, account: string): void {
    this.maybeCleanup();
    const now = Date.now();
    this.bump(this.accountKey(ip, account), now, this.failLimit);
    this.bump(this.ipKey(ip), now, this.ipFailLimit);
  }

  /** 登录成功：清除该账号的失败计数（IP 级保留，防同网段继续爆破） */
  reset(ip: string, account: string): void {
    this.store.delete(this.accountKey(ip, account));
  }

  private bump(key: string, now: number, limit: number): void {
    let rec = this.store.get(key);
    if (!rec || (rec.lockUntil <= now && now - rec.updatedAt > this.lockMs)) {
      rec = { failCount: 0, lockUntil: 0, updatedAt: now };
    }
    rec.failCount += 1;
    rec.updatedAt = now;
    if (rec.failCount >= limit) {
      rec.lockUntil = now + this.lockMs;
      rec.failCount = 0;
    }
    this.store.set(key, rec);
  }

  private accountKey(ip: string, account: string): string {
    return 'a:' + (ip || '0.0.0.0') + ':' + (account || '').trim().toLowerCase();
  }

  private ipKey(ip: string): string {
    return 'i:' + (ip || '0.0.0.0');
  }

  /** 惰性清理：避免 Map 无限增长 */
  private maybeCleanup(): void {
    this.ops += 1;
    if (this.ops % CLEANUP_EVERY !== 0) return;
    const now = Date.now();
    for (const [k, v] of this.store) {
      if (v.lockUntil <= now && now - v.updatedAt > this.lockMs) {
        this.store.delete(k);
      }
    }
    if (this.store.size > MAX_RECORDS) {
      // 极端情况：清掉全部非锁定记录
      for (const [k, v] of this.store) {
        if (v.lockUntil <= now) this.store.delete(k);
      }
    }
  }
}

/** 全局单例（auth 与 admin-auth 共用） */
export const loginRateLimiter = new LoginRateLimiter();