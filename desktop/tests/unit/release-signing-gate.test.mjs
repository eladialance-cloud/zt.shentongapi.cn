/**
 * 发布签名门禁单元测试（安全审计 S-02）
 * 运行: node --test tests/unit/release-signing-gate.test.mjs
 *
 * 门禁的意义在于「缺证书必须构建失败」：electron-builder 本身只会静默产出未签名包，
 * 所以这里重点覆盖「判缺失」的边界（空串 / 空白串 / 仅 CSC_NAME / 显式绕过）。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReleaseSigning, REQUIRED_SIGNING_ENV } from '../../scripts/check-release-signing.mjs';

const WIN_OK = { CSC_LINK: 'C:/certs/st.pfx', CSC_KEY_PASSWORD: 'p@ss' };
const MAC_OK = {
  CSC_LINK: 'C:/certs/devid.p12',
  CSC_KEY_PASSWORD: 'p@ss',
  APPLE_ID: 'dev@example.com',
  APPLE_APP_SPECIFIC_PASSWORD: 'abcd-efgh-ijkl-mnop',
  APPLE_TEAM_ID: 'TEAM123456',
};

describe('evaluateReleaseSigning', () => {
  it('Windows：证书 + 密码齐备 → ok', () => {
    const r = evaluateReleaseSigning(WIN_OK, 'win32');
    assert.equal(r.ok, true);
    assert.equal(r.bypassed, false);
    assert.deepEqual(r.missing, []);
  });

  it('Windows：兼容旧变量名 WIN_CSC_LINK', () => {
    assert.equal(evaluateReleaseSigning({ WIN_CSC_LINK: 'C:/certs/st.pfx', CSC_KEY_PASSWORD: 'x' }, 'win32').ok, true);
  });

  it('Windows：缺证书 / 缺密码分别报出缺失项', () => {
    assert.deepEqual(evaluateReleaseSigning({}, 'win32').missing, ['CSC_LINK（或 WIN_CSC_LINK）', 'CSC_KEY_PASSWORD']);
    assert.deepEqual(evaluateReleaseSigning({ CSC_LINK: 'C:/st.pfx' }, 'win32').missing, ['CSC_KEY_PASSWORD']);
    assert.equal(evaluateReleaseSigning({ CSC_LINK: 'C:/st.pfx' }, 'win32').ok, false);
  });

  it('空白串视为未配置（避免 CI 里空变量蒙混过关）', () => {
    const r = evaluateReleaseSigning({ CSC_LINK: '   ', CSC_KEY_PASSWORD: '\t' }, 'win32');
    assert.equal(r.ok, false);
    assert.equal(r.missing.length, 2);
  });

  it('macOS：证书 + 公证凭据齐备 → ok', () => {
    assert.equal(evaluateReleaseSigning(MAC_OK, 'darwin').ok, true);
  });

  it('macOS：钥匙串身份 CSC_NAME 不需要证书密码', () => {
    const r = evaluateReleaseSigning(
      { CSC_NAME: 'Developer ID Application: Example', APPLE_ID: 'a', APPLE_APP_SPECIFIC_PASSWORD: 'b', APPLE_TEAM_ID: 'T' },
      'darwin',
    );
    assert.equal(r.ok, true);
    assert.deepEqual(r.missing, []);
  });

  it('macOS：用 CSC_LINK 却没给密码 → 报缺失', () => {
    const r = evaluateReleaseSigning({ ...MAC_OK, CSC_KEY_PASSWORD: '' }, 'darwin');
    assert.equal(r.ok, false);
    assert.ok(r.missing.some((m) => m.includes('CSC_KEY_PASSWORD')));
  });

  it('macOS：缺公证凭据 → 报缺失（未公证的包 Gatekeeper 会拦）', () => {
    const r = evaluateReleaseSigning({ CSC_LINK: 'x.p12', CSC_KEY_PASSWORD: 'p' }, 'darwin');
    assert.equal(r.ok, false);
    assert.ok(r.missing.includes('APPLE_ID'));
    assert.ok(r.missing.includes('APPLE_APP_SPECIFIC_PASSWORD'));
    assert.ok(r.missing.includes('APPLE_TEAM_ID'));
  });

  it('显式绕过：ST_ALLOW_UNSIGNED_RELEASE=1/true → ok 但标记 bypassed', () => {
    const one = evaluateReleaseSigning({ ST_ALLOW_UNSIGNED_RELEASE: '1' }, 'win32');
    assert.equal(one.ok, true);
    assert.equal(one.bypassed, true);
    assert.ok(one.missing.length > 0);
    assert.equal(evaluateReleaseSigning({ ST_ALLOW_UNSIGNED_RELEASE: 'true' }, 'win32').bypassed, true);
    // 其它取值不构成绕过
    assert.equal(evaluateReleaseSigning({ ST_ALLOW_UNSIGNED_RELEASE: '0' }, 'win32').ok, false);
    assert.equal(evaluateReleaseSigning({ ST_ALLOW_UNSIGNED_RELEASE: 'yes' }, 'win32').ok, false);
  });

  it('非 win/mac 平台跳过（不阻塞 Linux 打包）', () => {
    const r = evaluateReleaseSigning({}, 'linux');
    assert.equal(r.ok, true);
    assert.equal(r.skipped, true);
  });

  it('入参异常 fail-safe：undefined env 在 Windows 下不通过', () => {
    assert.equal(evaluateReleaseSigning(undefined, 'win32').ok, false);
    assert.equal(evaluateReleaseSigning(null, 'darwin').ok, false);
  });

  it('导出必需变量清单（供 CI 文档与错误提示复用）', () => {
    assert.ok(REQUIRED_SIGNING_ENV.win32.length >= 2);
    assert.ok(REQUIRED_SIGNING_ENV.darwin.length >= 5);
  });
});
