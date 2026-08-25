/** 口播工坊媒体安全单元测试（P0）
 * 运行: node -r ts-node/register --test test/unit/oral-workshop-media-security.spec.ts
 *
 * 覆盖：
 * - validateMediaRef：DTO 白名单（公网 http(s) / /uploads/ 相对路径，拒绝穿越与本地路径）
 * - resolveLocalMediaPath：拒绝 ../ 穿越与绝对路径，只允许 uploads 目录内
 * - assertPublicMediaUrl：SSRF 防护（拒绝内网/环回/云元数据；放行自身 /uploads/ 静态命名空间）
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as dns from 'node:dns';
import * as path from 'node:path';
import {
  validateMediaRef,
  resolveLocalMediaPath,
  assertPublicMediaUrl,
  looksLikeHtml,
} from '../../src/modules/oral-workshop/ffmpeg';

describe('validateMediaRef（DTO 白名单）', () => {
  it('接受公网 http(s) 链接', () => {
    assert.equal(validateMediaRef('https://oss.example.com/a.mp3'), true);
    assert.equal(validateMediaRef('http://example.com/x?token=1'), true);
  });

  it('接受 /uploads/ 开头的服务端相对路径', () => {
    assert.equal(validateMediaRef('/uploads/files/a.mp3'), true);
    assert.equal(validateMediaRef('/uploads/oral-workshop/1/final.mp4'), true);
  });

  it('拒绝本地绝对路径 / 穿越 / 非白名单协议', () => {
    assert.equal(validateMediaRef('../../.env'), false);
    assert.equal(validateMediaRef('/etc/passwd'), false);
    assert.equal(validateMediaRef('C:\\Windows\\win.ini'), false);
    assert.equal(validateMediaRef('\\\\server\\share\\x'), false);
    assert.equal(validateMediaRef('file:///etc/passwd'), false);
    assert.equal(validateMediaRef('/uploads/../../.env'), false);
    assert.equal(validateMediaRef(''), false);
    assert.equal(validateMediaRef('relative/path.mp3'), false);
  });
});

describe('resolveLocalMediaPath（本地路径硬化）', () => {
  it('拒绝 ../ 穿越路径', () => {
    assert.throws(() => resolveLocalMediaPath('../../etc/passwd'), /uploads/);
    assert.throws(() => resolveLocalMediaPath('uploads/../../../etc/passwd'), /uploads/);
  });

  it('拒绝绝对路径与 UNC', () => {
    assert.throws(() => resolveLocalMediaPath('C:\\Windows\\win.ini'), /uploads|绝对路径/);
    assert.throws(() => resolveLocalMediaPath('/etc/passwd'), /uploads/);
    assert.throws(() => resolveLocalMediaPath('\\\\server\\share\\x'), /uploads|绝对路径/);
  });

  it('接受 uploads 目录内的相对/斜杠路径', () => {
    const p = resolveLocalMediaPath('/uploads/oral-workshop/1/final.mp4');
    assert.equal(p, path.resolve('uploads/oral-workshop/1/final.mp4'));
    const p2 = resolveLocalMediaPath('uploads/files/a.mp3');
    assert.equal(p2, path.resolve('uploads/files/a.mp3'));
  });
});

describe('assertPublicMediaUrl（SSRF 防护）', () => {
  it('拒绝内网/环回/云元数据字面地址', async () => {
    await assert.rejects(() => assertPublicMediaUrl('http://127.0.0.1:3001/api/health'), /内网|环回|uploads/);
    await assert.rejects(() => assertPublicMediaUrl('http://169.254.169.254/latest/meta-data/'), /内网|uploads/);
    await assert.rejects(() => assertPublicMediaUrl('http://10.0.0.5/x'), /内网|uploads/);
    await assert.rejects(() => assertPublicMediaUrl('http://192.168.1.10/x'), /内网|uploads/);
    await assert.rejects(() => assertPublicMediaUrl('http://172.16.0.1/x'), /内网|uploads/);
    await assert.rejects(() => assertPublicMediaUrl('http://[::1]/x'), /内网|uploads/);
  });

  it('放行自身 /uploads/ 静态命名空间（同源上传产物，开发环境 localhost 也可用）', async () => {
    await assert.doesNotReject(() => assertPublicMediaUrl('http://127.0.0.1:3001/uploads/files/a.mp3'));
    await assert.doesNotReject(() => assertPublicMediaUrl('https://zt.shentongapi.cn/uploads/oral-workshop/1/final.mp4'));
  });

  it('拒绝域名解析到内网的地址', async () => {
    const orig = dns.promises.lookup;
    (dns.promises as any).lookup = async () => ({ address: '127.0.0.1', family: 4 });
    try {
      await assert.rejects(() => assertPublicMediaUrl('http://evil.example.com/x'), /内网|uploads/);
    } finally {
      (dns.promises as any).lookup = orig;
    }
  });

  it('接受解析到公网的域名', async () => {
    const orig = dns.promises.lookup;
    (dns.promises as any).lookup = async () => ({ address: '8.8.8.8', family: 4 });
    try {
      await assert.doesNotReject(() => assertPublicMediaUrl('http://example.com/x'));
    } finally {
      (dns.promises as any).lookup = orig;
    }
  });
});

describe('looksLikeHtml（网页内容探测）', () => {
  it('识别常见 HTML 页面头（DOCTYPE / html / script / meta）', () => {
    assert.equal(looksLikeHtml(Buffer.from('<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>hi</body></html>')), true);
    assert.equal(looksLikeHtml(Buffer.from('<!doctype html>\n<html lang="zh-CN">...')), true);
    assert.equal(looksLikeHtml(Buffer.from('<script>window.__INITIAL_STATE__={}</script>')), true);
    assert.equal(looksLikeHtml(Buffer.from('  \n  <meta name="description" content="x">')), true);
  });

  it('不误判媒体文件头（mp4 flv 等二进制/文本直链内容）', () => {
    assert.equal(looksLikeHtml(Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])), false);
    assert.equal(looksLikeHtml(Buffer.from([0x46, 0x4c, 0x56, 0x01, 0x05])), false);
    assert.equal(looksLikeHtml(Buffer.from('')), false);
    assert.equal(looksLikeHtml(Buffer.from('ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000')), false);
    assert.equal(looksLikeHtml(Buffer.from('not html at all but plain text')), false);
  });
});
