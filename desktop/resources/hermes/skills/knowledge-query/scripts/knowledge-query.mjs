#!/usr/bin/env node
/**
 * 知识库检索工具卡执行脚本
 * 检索云端知识库：全局（本人库 + 官方已发布库）或指定库
 * 依赖环境变量（由桌面端 service-manager 注入）：
 *   ST_API_BASE        - 云端 API 地址（默认 https://zt.shentongapi.cn/api）
 *   ST_AUTH_FILE       - 云端登录信息文件（含 token）
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function arg(name, def = '') {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : def;
}

async function main() {
  const query = arg('query').trim();
  if (!query) {
    console.error('缺少 --query 参数');
    process.exit(2);
  }
  const mode = arg('mode', '');
  const kbId = arg('kb-id');
  const topK = Number(arg('top-k', '5')) || 5;

  // 检索范围：显式 --mode/--kb-id 优先；否则读取会话范围文件（桌面端按当前会话写入）
  let scope = { mode: 'global' };
  if (mode || kbId) {
    scope = {
      mode: mode || (kbId ? 'kb' : 'global'),
      kbId: kbId ? Number(kbId) : undefined,
    };
  } else if (process.env.ST_AUTH_FILE) {
    try {
      const scopePath = join(dirname(process.env.ST_AUTH_FILE), 'knowledge-scope.json');
      const parsed = JSON.parse(readFileSync(scopePath, 'utf8'));
      if (parsed && typeof parsed === 'object') scope = parsed;
    } catch {}
  }
  const finalMode = scope.mode === 'kb' ? 'kb' : 'global';
  const finalKbId = scope.kbId ? Number(scope.kbId) : undefined;

  const apiBase = process.env.ST_API_BASE || 'https://zt.shentongapi.cn/api';

  let token = '';
  try {
    token = JSON.parse(readFileSync(process.env.ST_AUTH_FILE, 'utf8')).token || '';
  } catch {}
  if (!token) {
    console.error('未登录或离线，请先在桌面端登录并联网');
    process.exit(1);
  }

  let url;
  let body;
  if (finalMode === 'kb') {
    if (!finalKbId) {
      console.error('指定库模式需要 --kb-id 参数');
      process.exit(2);
    }
    url = apiBase + '/knowledge/bases/' + finalKbId + '/search';
    body = { query, topK };
  } else {
    url = apiBase + '/knowledge/search-all';
    body = { query, topK };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    if (res.status === 401) {
      throw new Error('登录已失效，请重新登录桌面端');
    }
    if (res.status === 404) {
      throw new Error('知识库不存在或无权访问（kb-id=' + kbId + '）');
    }
    throw new Error('知识库检索失败(' + res.status + '): ' + text);
  }

  const data = await res.json();
  const results = data?.data ?? data;
  if (!Array.isArray(results) || results.length === 0) {
    console.log('未找到相关资料，请如实告知用户当前知识库中没有匹配内容');
    return;
  }

  console.log('检索到以下资料片段：');
  results.forEach((item, idx) => {
    const kbName = item.kbName ? ' [' + item.kbName + ']' : '';
    const docName = item.documentName || '';
    console.log('---');
    console.log('片段' + (idx + 1) + '（来源库' + kbName + ' / 文档：' + docName + '）');
    console.log(String(item.content || '').slice(0, 2000));
  });
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
