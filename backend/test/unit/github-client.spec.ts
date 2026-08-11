import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubClientService } from '../../src/modules/admin-imports/github-client.service';

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
