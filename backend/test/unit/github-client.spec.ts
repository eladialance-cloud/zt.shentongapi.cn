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
