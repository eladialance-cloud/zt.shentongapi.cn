#!/usr/bin/env node
/**
 * 发布签名门禁（安全审计 S-02）
 *
 * 为什么需要：electron-builder 在缺少签名身份时**不会报错**，只会静默产出未签名安装包 ——
 * 用户侧看到 SmartScreen / Gatekeeper 告警（等于教育用户忽略安全警告），
 * 更新包被替换时也没有第二道防线（与 S-01 叠加成完整 RCE 链）。
 * 本脚本把「必须有签名身份」变成发布流程的硬性前置：缺证书直接构建失败。
 *
 * 用法（打包前执行）：node scripts/check-release-signing.mjs
 *
 * 环境变量（CI 注入，切勿写进仓库）：
 *   Windows：CSC_LINK（.pfx 路径或 base64）、CSC_KEY_PASSWORD
 *   macOS  ：CSC_LINK 或钥匙串身份 CSC_NAME、CSC_KEY_PASSWORD（用 CSC_LINK 时必填）、
 *            APPLE_ID、APPLE_APP_SPECIFIC_PASSWORD、APPLE_TEAM_ID（公证用）
 * 本地调试需要出未签名包：ST_ALLOW_UNSIGNED_RELEASE=1（打 warn，正式发布不得使用）
 *
 * evaluateReleaseSigning 是纯函数，可被 node:test 直接调用。
 */
import { pathToFileURL } from 'node:url';

/** 各平台发布所需的环境变量（用于文档与错误提示） */
export const REQUIRED_SIGNING_ENV = {
  win32: ['CSC_LINK（或 WIN_CSC_LINK）', 'CSC_KEY_PASSWORD'],
  darwin: [
    'CSC_LINK（或钥匙串身份 CSC_NAME）',
    'CSC_KEY_PASSWORD（使用 CSC_LINK 时必填）',
    'APPLE_ID',
    'APPLE_APP_SPECIFIC_PASSWORD',
    'APPLE_TEAM_ID',
  ],
};

/**
 * 评估发布签名配置是否满足门禁要求。
 * @param {Record<string, string | undefined>} env 环境变量（通常传 process.env）
 * @param {string} platform 目标平台（process.platform）
 * @returns {{ ok: boolean, skipped: boolean, bypassed: boolean, platform: string, missing: string[] }}
 */
export function evaluateReleaseSigning(env, platform = process.platform) {
  const source = env || {};
  const has = (key) => typeof source[key] === 'string' && source[key].trim() !== '';
  const missing = [];

  if (platform === 'win32') {
    if (!has('CSC_LINK') && !has('WIN_CSC_LINK')) missing.push('CSC_LINK（或 WIN_CSC_LINK）');
    if (!has('CSC_KEY_PASSWORD')) missing.push('CSC_KEY_PASSWORD');
  } else if (platform === 'darwin') {
    const usesCertFile = has('CSC_LINK');
    if (!usesCertFile && !has('CSC_NAME')) missing.push('CSC_LINK（或钥匙串身份 CSC_NAME）');
    if (usesCertFile && !has('CSC_KEY_PASSWORD')) missing.push('CSC_KEY_PASSWORD（使用 CSC_LINK 时必填）');
    if (!has('APPLE_ID')) missing.push('APPLE_ID');
    if (!has('APPLE_APP_SPECIFIC_PASSWORD')) missing.push('APPLE_APP_SPECIFIC_PASSWORD');
    if (!has('APPLE_TEAM_ID')) missing.push('APPLE_TEAM_ID');
  } else {
    return { ok: true, skipped: true, bypassed: false, platform, missing: [] };
  }

  const bypassed =
    has('ST_ALLOW_UNSIGNED_RELEASE') &&
    (source.ST_ALLOW_UNSIGNED_RELEASE.trim() === '1' ||
      source.ST_ALLOW_UNSIGNED_RELEASE.trim().toLowerCase() === 'true');

  if (missing.length === 0) return { ok: true, skipped: false, bypassed: false, platform, missing: [] };
  return { ok: bypassed, skipped: false, bypassed, platform, missing };
}

const invokedDirectly =
  typeof process.argv[1] === 'string' && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
  const result = evaluateReleaseSigning(process.env, process.platform);
  if (result.skipped) {
    console.log('[release-signing] 平台 ' + result.platform + ' 无需代码签名校验，跳过');
    process.exit(0);
  }
  if (result.ok && result.bypassed) {
    console.warn('[release-signing] 警告：ST_ALLOW_UNSIGNED_RELEASE 已设置，跳过签名校验');
    console.warn('  缺失项：' + result.missing.join('、'));
    console.warn('  此产物不会被签名，仅限本地调试，请勿用于正式发布');
    process.exit(0);
  }
  if (result.ok) {
    console.log('[release-signing] 签名身份就绪（' + result.platform + '）');
    process.exit(0);
  }
  console.error('[release-signing] 未配置代码签名身份，已阻止打包（安全审计 S-02）。缺失：');
  for (const item of result.missing) console.error('   - ' + item);
  console.error('  Windows：CSC_LINK + CSC_KEY_PASSWORD');
  console.error('  macOS  ：CSC_LINK/CSC_NAME + CSC_KEY_PASSWORD + APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID');
  console.error('  仅本地调试可设置 ST_ALLOW_UNSIGNED_RELEASE=1 跳过（正式发布不得使用）');
  process.exit(1);
}
