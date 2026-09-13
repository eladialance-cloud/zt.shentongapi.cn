/**
 * Hermes 工具卡共享读取器（auth-file.mjs）单元测试（node:test）
 * 运行: node --test tests/unit/hermes-auth-file.test.mjs
 *
 * 重点验证「主进程加密 ↔ Hermes 子进程解密」的互操作性：
 * 主进程用 electron/main/policy/secret-box.ts 落盘密文，工具卡脚本必须能用自己的实现解开。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSealedBox, openBox, readAuthToken } from '../../resources/hermes/skills/knowledge-query/scripts/auth-file.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KQ_COPY = join(__dirname, '..', '..', 'resources', 'hermes', 'skills', 'knowledge-query', 'scripts', 'auth-file.mjs');
const N8N_COPY = join(__dirname, '..', '..', 'resources', 'hermes', 'skills', 'n8n-run-workflow', 'scripts', 'auth-file.mjs');

// 黄金向量：由 electron/main/policy/secret-box.ts 实际生成（tsx 运行），用于跨实现互操作校验
const GOLDEN_KEY = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=';
const GOLDEN_SEALED = 'v1.0t/VQO870PDt9yIq.zwB7pda/gyR4wWj1StmXRw==.i/DbLzKtp5qyMmbQRB92xfI2a62Hh79DFQL9Yw==';
const GOLDEN_PLAIN = '{"token":"golden-token-abc"}';

const tmp = mkdtempSync(join(tmpdir(), 'st-auth-file-'));
let seq = 0;
function writeAuth(rawText) {
  const file = join(tmp, 'auth-' + seq++ + '.json');
  writeFileSync(file, rawText, 'utf8');
  return file;
}
function read(file, env) {
  return readAuthToken({ ST_AUTH_FILE: file, ...env });
}

describe('auth-file 互操作（主进程密文 → 工具卡解密）', () => {
  it('黄金向量：secret-box.ts 生成的密文可被工具卡实现解开', () => {
    assert.equal(openBox(GOLDEN_SEALED, GOLDEN_KEY), GOLDEN_PLAIN);
    const file = writeAuth(JSON.stringify({ v: 1, enc: true, data: GOLDEN_SEALED }));
    assert.equal(read(file, { ST_AUTH_KEY: GOLDEN_KEY }), 'golden-token-abc');
  });

  it('密文信封 + 正确密钥 → 读出 token', () => {
    const file = writeAuth(JSON.stringify({ v: 1, enc: true, data: GOLDEN_SEALED }));
    assert.equal(read(file, { ST_AUTH_KEY: GOLDEN_KEY }), 'golden-token-abc');
  });

  it('密文信封但缺密钥 → 返回空且不抛错（绝不回退明文）', () => {
    const file = writeAuth(JSON.stringify({ v: 1, enc: true, data: GOLDEN_SEALED }));
    assert.equal(read(file, {}), '');
  });

  it('密文信封 + 错误密钥 → 返回空（不返回脏数据）', () => {
    const wrong = Buffer.alloc(32, 9).toString('base64');
    const file = writeAuth(JSON.stringify({ v: 1, enc: true, data: GOLDEN_SEALED }));
    assert.equal(read(file, { ST_AUTH_KEY: wrong }), '');
  });

  it('密文被篡改 → 返回空（GCM 完整性校验生效）', () => {
    const parts = GOLDEN_SEALED.split('.');
    const ct = Buffer.from(parts[3], 'base64');
    ct[0] = ct[0] ^ 0xff;
    const tampered = [parts[0], parts[1], parts[2], ct.toString('base64')].join('.');
    const file = writeAuth(JSON.stringify({ v: 1, enc: true, data: tampered }));
    assert.equal(read(file, { ST_AUTH_KEY: GOLDEN_KEY }), '');
  });
})

describe('auth-file 兼容与健壮性', () => {
  it('历史明文裸 JSON 仍可读（升级期兼容）', () => {
    const file = writeAuth(JSON.stringify({ token: 'legacy-plain' }));
    assert.equal(read(file, {}), 'legacy-plain');
  });

  it('开发环境 enc:false 信封可读', () => {
    const file = writeAuth(JSON.stringify({ v: 1, enc: false, data: JSON.stringify({ token: 'dev-plain' }) }));
    assert.equal(read(file, { ST_AUTH_KEY: GOLDEN_KEY }), 'dev-plain');
  });

  it('文件缺失 / 非法 JSON / 结构异常一律返回空字符串', () => {
    assert.equal(read(join(tmp, 'nope.json'), { ST_AUTH_KEY: GOLDEN_KEY }), '');
    assert.equal(read(writeAuth('not json'), {}), '');
    assert.equal(read(writeAuth('[1,2,3]'), {}), '');
    assert.equal(read(writeAuth('null'), {}), '');
    assert.equal(read(writeAuth(JSON.stringify({ token: 42 })), {}), '');
    assert.equal(readAuthToken({}), '');
  });

  it('isSealedBox 判定与 secret-box.ts 一致', () => {
    assert.equal(isSealedBox(GOLDEN_SEALED), true);
    assert.equal(isSealedBox('v1.a.b.c'), true);
    assert.equal(isSealedBox('plain'), false);
    assert.equal(isSealedBox('v2.a.b.c'), false);
    assert.equal(isSealedBox(null), false);
  });

  it('openBox 密钥长度非法时抛错', () => {
    assert.throws(() => openBox(GOLDEN_SEALED, Buffer.alloc(16).toString('base64')));
  });
})

describe('两个技能目录的副本必须一致', () => {
  it('knowledge-query 与 n8n-run-workflow 下的 auth-file.mjs 内容相同（防止漂移）', () => {
    const a = readFileSync(KQ_COPY, 'utf8');
    const b = readFileSync(N8N_COPY, 'utf8');
    assert.equal(a, b);
  });
});

describe('清理', () => {
  it('删除临时目录', () => {
    rmSync(tmp, { recursive: true, force: true });
    assert.ok(true);
  });
});
