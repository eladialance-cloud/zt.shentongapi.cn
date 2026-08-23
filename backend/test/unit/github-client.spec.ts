import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { GitHubClientService, extractGithubRepoFromHtml, extractGithubReposFromHtml, listTarGzEntries, probeGithubArchive, raceTimeout } from '../../src/modules/admin-imports/github-client.service';

type FetchImpl = (url: RequestInfo | URL, init?: RequestInit) => Promise<any>;

function mockFetch(impl: FetchImpl) {
  mock.method(globalThis, 'fetch', impl);
}

const svc = new GitHubClientService();

test('parseRepoUrl 支持 https/.git/git@ 三种格式', () => {
  assert.deepEqual(GitHubClientService.parseRepoUrl('https://github.com/eladialance-cloud/zt.shentongapi.cn'), { owner: 'eladialance-cloud', repo: 'zt.shentongapi.cn' });
  assert.deepEqual(GitHubClientService.parseRepoUrl('https://github.com/x/y.git'), { owner: 'x', repo: 'y' });
  assert.deepEqual(GitHubClientService.parseRepoUrl('git@github.com:openai/codex.git'), { owner: 'openai', repo: 'codex' });
  assert.throws(() => GitHubClientService.parseRepoUrl('https://example.com/x/y'));
});

test('extractGithubRepoFromHtml 提取首个 github 仓库链接', () => {
  assert.deepEqual(
    extractGithubRepoFromHtml('<a href="https://github.com/openai/skills">openai skills</a><a href="https://github.com/foo/bar">x</a>'),
    { owner: 'openai', repo: 'skills' }
  );
  assert.deepEqual(extractGithubRepoFromHtml('见 https://github.com/a/b.git 仓库'), { owner: 'a', repo: 'b' });
  assert.equal(extractGithubRepoFromHtml(''), null);
  assert.equal(extractGithubRepoFromHtml('no github link'), null);
});

/** 构造最小 tar.gz（仅用于 listTarGzEntries 单测） */
function makeTarGz(files: Array<{ name: string; content?: string; dir?: boolean }>): Buffer {
  const blocks: Buffer[] = [];
  for (const f of files) {
    const h = Buffer.alloc(512);
    h.write(f.name.slice(0, 100), 0, 'utf8');
    const size = f.dir ? 0 : Buffer.byteLength(f.content ?? '', 'utf8');
    h.write(size.toString(8).padStart(11, '0') + '\0', 124, 'ascii');
    h.write(f.dir ? '5' : '0', 156, 'ascii');
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += h[i];
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');
    blocks.push(h);
    if (!f.dir) {
      const data = Buffer.from(f.content ?? '', 'utf8');
      blocks.push(data);
      const pad = (512 - (data.length % 512)) % 512;
      if (pad) blocks.push(Buffer.alloc(pad));
    }
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

test('probeGithubArchive 探测 main 命中', async () => {
  const hits: string[] = [];
  mockFetch(async (url, init) => {
    hits.push(String(url) + '|' + (init?.method ?? ''));
    return { ok: String(url).includes('main.tar.gz'), status: 200 };
  });
  assert.deepEqual(await probeGithubArchive('x', 'y'), { status: 'ok', branch: 'main' });
  assert.equal(hits[0], 'https://github.com/x/y/archive/refs/heads/main.tar.gz|HEAD');
});

test('probeGithubArchive main 缺失回退 master', async () => {
  mockFetch(async (url) => {
    const u = String(url);
    const ok = u.includes('master.tar.gz');
    return { ok, status: ok ? 200 : 404 };
  });
  assert.deepEqual(await probeGithubArchive('x', 'y'), { status: 'ok', branch: 'master' });
});

test('probeGithubArchive 仅 HEAD 可用返回 ok 无分支', async () => {
  mockFetch(async (url) => ({ ok: String(url).includes('HEAD.tar.gz'), status: 404 }));
  assert.deepEqual(await probeGithubArchive('x', 'y'), { status: 'ok', branch: null });
});

test('probeGithubArchive 仓库不存在返回 missing', async () => {
  mockFetch(async () => ({ ok: false, status: 404 }));
  assert.deepEqual(await probeGithubArchive('x', 'y'), { status: 'missing' });
});

test('probeGithubArchive 网络异常返回 error', async () => {
  mockFetch(async () => { throw new Error('network down'); });
  assert.deepEqual(await probeGithubArchive('x', 'y'), { status: 'error' });
});

test('probeGithubArchive 403 视为 error 不误判为缺失', async () => {
  mockFetch(async () => ({ ok: false, status: 403 }));
  assert.deepEqual(await probeGithubArchive('x', 'y'), { status: 'error' });
});

test('listTarGzEntries 解压并剥离根目录前缀', () => {
  const gz = makeTarGz([
    { name: 'myrepo-main/README.md', content: '# hi' },
    { name: 'myrepo-main/categories/ai.md', content: '- [x](https://clawskills.sh/skills/a-b)' },
    { name: 'myrepo-main/categories/', dir: true },
  ]);
  assert.deepEqual(listTarGzEntries(gz), ['README.md', 'categories/ai.md']);
});

test('getRepoTree API 失败时 tar.gz 兜底列目录', async () => {
  const gz = makeTarGz([
    { name: 'cat-main/README.md', content: 'r' },
    { name: 'cat-main/categories/dev.md', content: '- [s](https://github.com/a/b)' },
    { name: 'cat-main/node_modules/x.js', content: 'x' },
  ]);
  mockFetch(async (url) => {
    const u = String(url);
    if (u.includes('api.github.com')) return { ok: false, status: 403 };
    if (u.includes('archive/')) return { ok: true, status: 200, arrayBuffer: async () => gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength) };
    return { ok: false, status: 404 };
  });
  const files = await svc.getRepoTree('cat', 'catalog', 'main');
  assert.deepEqual(files.map(f => f.path), ['README.md', 'categories/dev.md']);
});

test('getRepoTopics 返回 topics', async () => {
  const calls: string[] = [];
  mockFetch(async (url, init) => {
    calls.push(String(url));
    void init;
    return { ok: true, status: 200, json: async () => ({ names: ['ai', 'agent'] }) };
  });
  const topics = await svc.getRepoTopics('x', 'y');
  assert.deepEqual(topics, ['ai', 'agent']);
  assert.ok(calls[0].includes('https://api.github.com/repos/x/y/topics'));
});

test('getRepoTree 递归返回文件列表并过滤依赖目录', async () => {
  mockFetch(async (url) => {
    if (String(url).includes('git/trees')) {
      return { ok: true, status: 200, json: async () => ({ tree: [{ path: 'a.json', type: 'blob' }, { path: 'src/b.md', type: 'blob' }, { path: 'node_modules/c.js', type: 'blob' }], truncated: false }) };
    }
    return { ok: false, status: 404 };
  });
  const files = await svc.getRepoTree('x', 'y', 'main');
  assert.deepEqual(files.map(f => f.path), ['a.json', 'src/b.md']);
});

test('getFileContent 404 返回 null', async () => {
  const seen: string[] = [];
  mockFetch(async (url) => {
    seen.push(String(url));
    return { ok: false, status: 404 };
  });
  assert.equal(await svc.getFileContent('x', 'y', 'a.md', 'main'), null);
  assert.ok(seen[0].startsWith('https://raw.githubusercontent.com/x/y/main/a.md'));
});

test('getRepoTree 根目录关键文件优先（大仓库不被 .github 等目录截断）', async () => {
  const tree: Array<{ path: string; type: string }> = [];
  // 模拟 .github 目录大量文件（字母序在根文件之前展开）
  for (let i = 0; i < 250; i++) tree.push({ path: '.github/workflows/ci-' + i + '.yml', type: 'blob' });
  tree.push({ path: '.claude/agents/a.md', type: 'blob' });
  tree.push({ path: 'package.json', type: 'blob' });
  tree.push({ path: 'README.md', type: 'blob' });
  tree.push({ path: 'src/index.ts', type: 'blob' });
  tree.push({ path: 'pyproject.toml', type: 'blob' });
  mockFetch(async (url) => {
    if (String(url).includes('git/trees')) {
      return { ok: true, status: 200, json: async () => ({ tree, truncated: false }) };
    }
    return { ok: false, status: 404 };
  });
  const files = await svc.getRepoTree('x', 'y', 'main');
  const paths = files.map(f => f.path);
  // 根目录文件优先于嵌套目录
  assert.ok(paths.indexOf('package.json') < paths.indexOf('.github/workflows/ci-0.yml'));
  assert.ok(paths.includes('package.json'));
  assert.ok(paths.includes('README.md'));
  assert.ok(paths.includes('pyproject.toml'));
});

test('getRepoTree 过滤后超过 500 个文件时按上限截断', async () => {
  const tree: Array<{ path: string; type: string }> = [];
  for (let i = 0; i < 300; i++) tree.push({ path: 'root-' + i + '.json', type: 'blob' });
  for (let i = 0; i < 300; i++) tree.push({ path: 'deep/file-' + i + '.json', type: 'blob' });
  mockFetch(async (url) => {
    if (String(url).includes('git/trees')) {
      return { ok: true, status: 200, json: async () => ({ tree, truncated: false }) };
    }
    return { ok: false, status: 404 };
  });
  const files = await svc.getRepoTree('x', 'y', 'main');
  assert.equal(files.length, 500);
  // 根文件全部保留（根优先）
  assert.ok(files.some(f => f.path === 'root-299.json'));
});


test('网络抖动时 fetch 自动重试（前两次超时，第三次成功）', async () => {
  const calls: string[] = [];
  mockFetch(async (url, init) => {
    calls.push(String(url));
    void init;
    if (calls.length < 3) throw new Error('The operation was aborted due to timeout');
    return { ok: true, status: 200, json: async () => ({ names: ['ai'] }) };
  });
  const topics = await svc.getRepoTopics('x', 'y');
  assert.deepEqual(topics, ['ai']);
  assert.equal(calls.length, 3);
});

test('多次重试仍失败时抛出业务异常', async () => {
  mockFetch(async () => { throw new Error('The operation was aborted due to timeout'); });
  await assert.rejects(() => svc.getRepoTopics('x', 'y'), /GitHub 请求失败/);
});
test('raceTimeout 正常完成时返回结果并清理定时器', async () => {
  const v = await raceTimeout(Promise.resolve(42), 1000, 't');
  assert.equal(v, 42);
});

test('raceTimeout 超时兜底（DNS 挂起场景）', async () => {
  await assert.rejects(
    raceTimeout(new Promise(() => { /* never settles */ }), 30, 'hang'),
    /hang 超时（30ms）/
  );
});
test('extractGithubReposFromHtml 提取全部链接并去重、剥离 .git', () => {
  const html = '<a href="https://github.com/foo/bar">a</a><a href="https://github.com/foo/bar">dup</a><a href="https://github.com/voltagent/awesome-openclaw-skills">catalog</a><a href="https://github.com/a/b.git">git</a>';
  assert.deepEqual(extractGithubReposFromHtml(html), [
    { owner: 'foo', repo: 'bar' },
    { owner: 'voltagent', repo: 'awesome-openclaw-skills' },
    { owner: 'a', repo: 'b' },
  ]);
  // 兼容函数仍返回第一个
  assert.deepEqual(extractGithubRepoFromHtml(html), { owner: 'foo', repo: 'bar' });
});
test('probeGithubArchive 302 重定向视为仓库存在（不跟随 codeload，避免慢连接误判）', async () => {
  mockFetch(async (url) => ({ ok: false, status: String(url).includes('main.tar.gz') ? 302 : 404 }));
  assert.deepEqual(await probeGithubArchive('x', 'y'), { status: 'ok', branch: 'main' });
});
