import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgentParser } from '../../src/modules/admin-imports/parsers/agent-parser';
import { WorkflowParser } from '../../src/modules/admin-imports/parsers/workflow-parser';
import { McpParser } from '../../src/modules/admin-imports/parsers/mcp-parser';
import { N8nMcpParser } from '../../src/modules/admin-imports/parsers/n8n-mcp-parser';
import { SkillParser } from '../../src/modules/admin-imports/parsers/skill-parser';
import { SkillPackParser } from '../../src/modules/admin-imports/parsers/skill-pack-parser';
import { SkillCatalogParser, resolveRepoCandidates } from '../../src/modules/admin-imports/parsers/skill-catalog-parser';
import { SkillCatalogExpander, type SkillRepoFetcher } from '../../src/modules/admin-imports/parsers/skill-catalog-expander';
import type { ImportFile, ImportParseContext } from '../../src/modules/admin-imports/parsers/import-parser.interface';

const baseCtx = (files: ImportFile[], topics: string[] = []): ImportParseContext => ({
  repoUrl: 'https://github.com/x/y', branch: 'main', topics, files,
});

test('agent-parser: 解析 AGENT.md frontmatter + 正文为 systemPrompt，topics 映射分类', async () => {
  const ctx = baseCtx([
    { path: 'agents/writing/AGENT.md', content: '---\nname: writing-assistant\ndescription: 中文文案写作\nemotion: writing\n---\n你是一个专业的文案写作助手。' },
    { path: 'README.md', content: 'repo readme' },
  ], ['marketing']);
  const drafts = await new AgentParser().parse(ctx);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].name, 'writing-assistant');
  assert.ok(String(drafts[0].payload.systemPrompt).includes('文案写作'));
  assert.equal(drafts[0].category, 'copywriting'); // marketing → copywriting
  assert.equal(drafts[0].sourcePath, 'agents/writing/AGENT.md');
});

test('workflow-parser: 按场景子目录归类多个 json，sceneCategory 映射', async () => {
  const ctx = baseCtx([
    { path: 'workflow-json/热点监控/热点抓取.json', content: JSON.stringify({ name: '热点抓取', nodes: [{ id: 1 }, { id: 2 }] }) },
    { path: 'workflow-json/多平台内容分发/分发.json', content: JSON.stringify({ nodes: [] }) },
    { path: 'README.md', content: '' },
  ]);
  const drafts = await new WorkflowParser().parse(ctx);
  assert.equal(drafts.length, 2);
  const hotspot = drafts.find(d => d.name === '热点抓取');
  assert.ok(hotspot);
  assert.equal(hotspot.payload.sceneCategory, 'hotspot_monitor');
  const dist = drafts.find(d => d.name === '分发');
  assert.ok(dist);
  assert.equal(dist.payload.sceneCategory, 'multi_platform_distribution');
});

test('mcp-parser: package.json bin + README env 生成 MCP 配置草稿', async () => {
  const ctx = baseCtx([
    { path: 'package.json', content: JSON.stringify({ name: 'my-mcp', description: 'DB tool', bin: { 'my-mcp': './dist/index.js' } }) },
    { path: 'README.md', content: '## Environment\n- DB_URL (required): 数据库连接\n- DB_KEY: 可选密钥' },
  ], ['database']);
  const drafts = await new McpParser().parse(ctx);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].name, 'my-mcp');
  assert.equal(drafts[0].category, 'database');
  const payload = drafts[0].payload;
  assert.equal(payload.runtime, 'node');
  assert.equal(payload.transportType, 'stdio');
  assert.ok(Array.isArray(payload.envTemplate));
});

test('n8n-mcp-parser: 同 mcp-parser 但标记 n8nMcp', async () => {
  const ctx = baseCtx([{ path: 'package.json', content: JSON.stringify({ name: 'n8n-mcp', bin: { 'n8n-mcp': 'dist/index.js' } }) }, { path: 'README.md', content: '' }], []);
  const drafts = await new N8nMcpParser().parse(ctx);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].payload.n8nMcp, true);
});

test('skill-parser: SKILL.md frontmatter → triggerKeywords', async () => {
  const ctx = baseCtx([
    { path: 'skills/reply/SKILL.md', content: '---\nname: quick-reply\ndescription: 快捷回复\ntrigger: [回复, reply]\n---\n# Quick Reply\n技能正文' },
  ], []);
  const drafts = await new SkillParser().parse(ctx);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].name, 'quick-reply');
  assert.deepEqual(drafts[0].payload.triggerKeywords, ['回复', 'reply']);
  assert.equal(drafts[0].payload.runtimeType, 'openclaw');
});

test('skill-pack-parser: manifest.json → hermes 技能包草稿', async () => {
  const ctx = baseCtx([
    { path: 'pack/awesome-pack/manifest.json', content: JSON.stringify({ name: 'awesome-pack', displayName: '全套运营', description: '运营技能集合', skills: ['a', 'b'] }) },
  ], []);
  const drafts = await new SkillPackParser().parse(ctx);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].payload.runtimeType, 'hermes');
  assert.deepEqual(drafts[0].payload.skillIds, ['a', 'b']);
});
test('mcp-parser: 无 bin 且 README 首个 URL 为仓库链接 → 回退 npx 兜底', async () => {
  const ctx = baseCtx([
    { path: 'package.json', content: JSON.stringify({ name: 'no-bin-mcp', description: 'no bin' }) },
    { path: 'README.md', content: '![badge](https://github.com/x/y)' },
  ], []);
  const drafts = await new McpParser().parse(ctx);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].payload.transportType, 'stdio');
  assert.equal(drafts[0].payload.command, 'npx');
  assert.deepEqual(drafts[0].payload.args, ['no-bin-mcp']);
});

test('mcp-parser: README 中 /sse 端点特征 URL → http 传输（跳过仓库链接）', async () => {
  const ctx = baseCtx([
    { path: 'package.json', content: JSON.stringify({ name: 'sse-mcp', description: 'sse' }) },
    { path: 'README.md', content: '![badge](https://github.com/x/y)\nSSE endpoint: https://mcp.example.com/sse' },
  ], []);
  const drafts = await new McpParser().parse(ctx);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].payload.transportType, 'http');
  assert.equal(drafts[0].payload.url, 'https://mcp.example.com/sse');
});

test('workflow-parser: 无效 JSON / 无 nodes 文件跳过并计入 payload.errors', async () => {
  const ctx = baseCtx([
    { path: 'workflows/a.json', content: JSON.stringify({ name: 'a', nodes: [] }) },
    { path: 'workflows/broken.json', content: '{bad json' },
    { path: 'workflows/no-nodes.json', content: JSON.stringify({ name: 'b' }) },
  ]);
  const drafts = await new WorkflowParser().parse(ctx);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].name, 'a');
  assert.deepEqual(drafts[0].payload.errors, ['workflows/broken.json', 'workflows/no-nodes.json']);
});

test('skill-parser: 仓库无 SKILL.md 返回空草稿', async () => {
  const ctx = baseCtx([
    { path: 'README.md', content: 'hi' },
    { path: 'skills/reply/AGENT.md', content: '---\nname: x\n---\nbody' },
  ]);
  const drafts = await new SkillParser().parse(ctx);
  assert.deepEqual(drafts, []);
});

test('parser: content 为 null 的关键文件不产生草稿', async () => {
  const ctx = baseCtx([
    { path: 'package.json', content: null },
    { path: 'workflows/a.json', content: null },
    { path: 'skills/reply/SKILL.md', content: null },
  ]);
  assert.deepEqual(await new McpParser().parse(ctx), []);
  assert.deepEqual(await new WorkflowParser().parse(ctx), []);
  assert.deepEqual(await new SkillParser().parse(ctx), []);
});
test('mcp-parser: README 含 github.com 带路径链接（非仓库主页）→ 仍回退 npx 兜底', async () => {
  const ctx = baseCtx([
    { path: 'package.json', content: JSON.stringify({ name: 'src-mcp', description: 'no bin' }) },
    { path: 'README.md', content: 'Source: https://github.com/x/y/tree/main/src/mcp' },
  ], []);
  const drafts = await new McpParser().parse(ctx);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].payload.transportType, 'stdio');
  assert.equal(drafts[0].payload.command, 'npx');
  assert.deepEqual(drafts[0].payload.args, ['src-mcp']);
});

test('mcp-parser: Python 项目（pyproject.toml + README http 端点）→ http 传输 + runtime python', async () => {
  const ctx = baseCtx([
    { path: 'pyproject.toml', content: '[project]\nname = "n8n-mcp-py"\nversion = "0.1.0"' },
    { path: 'README.md', content: 'Server URL: http://localhost:8000/sse' },
  ], []);
  const drafts = await new McpParser().parse(ctx);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].name, 'n8n-mcp-py');
  assert.equal(drafts[0].payload.runtime, 'python');
  assert.equal(drafts[0].payload.transportType, 'http');
  assert.equal(drafts[0].payload.url, 'http://localhost:8000/sse');
});

test('mcp-parser: Python 项目无服务地址 → stdio uvx 兜底', async () => {
  const ctx = baseCtx([
    { path: 'pyproject.toml', content: '[project]\nname = "uv-mcp"\nversion = "1.0.0"' },
    { path: 'README.md', content: 'A python MCP server' },
  ], []);
  const drafts = await new McpParser().parse(ctx);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].payload.runtime, 'python');
  assert.equal(drafts[0].payload.transportType, 'stdio');
  assert.equal(drafts[0].payload.command, 'uvx');
  assert.deepEqual(drafts[0].payload.args, ['uv-mcp']);
});

test('mcp-parser: 仅 setup.py 也能提取包名（无 package.json/pyproject）', async () => {
  const ctx = baseCtx([
    { path: 'setup.py', content: 'from setuptools import setup\nsetup(name="setup-mcp", version="0.1")' },
    { path: 'README.md', content: 'http://127.0.0.1:9000/mcp' },
  ], []);
  const drafts = await new McpParser().parse(ctx);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].name, 'setup-mcp');
  assert.equal(drafts[0].payload.transportType, 'http');
});

test('n8n-mcp-parser: Python 项目（无 package.json）同样支持并标记 n8nMcp', async () => {
  const ctx = baseCtx([
    { path: 'pyproject.toml', content: '[project]\nname = "n8n-mcp-py"\nversion = "0.1.0"' },
    { path: 'README.md', content: 'SSE endpoint: https://mcp.example.com/sse' },
  ], []);
  const drafts = await new N8nMcpParser().parse(ctx);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].payload.n8nMcp, true);
  assert.equal(drafts[0].payload.runtime, 'python');
  assert.equal(drafts[0].payload.transportType, 'http');
});

test('mcp-parser: Python 项目无包名（pyproject 无 name）→ 返回空', async () => {
  const ctx = baseCtx([
    { path: 'pyproject.toml', content: '[build-system]\nrequires = ["setuptools"]' },
    { path: 'README.md', content: 'hello' },
  ], []);
  assert.deepEqual(await new McpParser().parse(ctx), []);
});


test('skill-catalog-parser: resolveRepoCandidates 解析 clawhub/clawskills/github 三类链接', () => {
  assert.deepEqual(resolveRepoCandidates('https://clawhub.ai/owner/repo'), [{ owner: 'owner', repo: 'repo' }]);
  assert.deepEqual(resolveRepoCandidates('https://github.com/foo/bar.git'), [{ owner: 'foo', repo: 'bar' }]);
  // clawskills slug 首个连字符切分
  const c1 = resolveRepoCandidates('https://clawskills.sh/skills/mfergpt-4claw');
  assert.ok(c1.some(c => c.owner === 'mfergpt' && c.repo === '4claw'));
  // owner 本身含连字符：第二个连字符切分命中
  const c2 = resolveRepoCandidates('https://clawskills.sh/skills/browseract-cli-browser-act-skills');
  assert.ok(c2.some(c => c.owner === 'browseract-cli' && c.repo === 'browser-act-skills'));
  assert.ok(c2.length <= 2);
  assert.deepEqual(resolveRepoCandidates('https://example.com/x'), []);
});

test('skill-catalog-parser: 解析 categories/*.md 行格式为条目（含分类、候选、描述）', () => {
  const parser = new SkillCatalogParser();
  const entries = parser.parseCatalogFiles([
    { path: 'categories/ai-and-llms.md', content: '\n- [claw-skill](https://clawskills.sh/skills/owner-skill) - AI 工具\n- [hub-skill](https://clawhub.ai/o/r) - 另一个\n- 普通行无链接\n' },
    { path: 'categories/devops-and-cloud.md', content: '- [gh-skill](https://github.com/foo/bar) - 云技能' },
  ]);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].category, 'ai-and-llms');
  assert.equal(entries[0].name, 'claw-skill');
  assert.equal(entries[0].description, 'AI 工具');
  assert.equal(entries[0].candidates[0].owner, 'owner');
  assert.equal(entries[1].candidates[0].owner, 'o');
  assert.equal(entries[2].category, 'devops-and-cloud');
});

test('skill-catalog-expander: 分类轮询 + 候选失败换下一个 + 失败计数', async () => {
  const skillMd = (name: string) => `---\nname: ${name}\ndescription: ${name} desc\n---\nbody`;
  const fetcher: SkillRepoFetcher = {
    fetchSkillMd: async (owner, repo) => {
      const key = owner + '/' + repo;
      const map: Record<string, string | null> = {
        'a1/a1': skillMd('a1'),
        'b1/b1': skillMd('b1'),
        'browseract/cli-browser-act-skills': null, // 候选1 失败
        'browseract-cli/browser-act-skills': skillMd('browser-act'), // 候选2 命中
      };
      const v = map[key];
      if (v == null) return null;
      return { path: 'SKILL.md', content: v };
    },
  };
  const expander = new SkillCatalogExpander(fetcher);
  const entries = [
    { name: 'a1', description: '', category: 'ai-and-llms', sourceUrl: 'https://clawskills.sh/skills/a1-a1', candidates: [{ owner: 'a1', repo: 'a1' }] },
    { name: 'a2', description: '', category: 'ai-and-llms', sourceUrl: 'https://clawskills.sh/skills/a2-a2', candidates: [{ owner: 'a2', repo: 'a2' }] },
    { name: 'b1', description: '', category: 'devops-and-cloud', sourceUrl: 'https://clawskills.sh/skills/b1-b1', candidates: [{ owner: 'b1', repo: 'b1' }] },
    { name: 'multi', description: '', category: 'devops-and-cloud', sourceUrl: 'https://clawskills.sh/skills/browseract-cli-browser-act-skills', candidates: [{ owner: 'browseract', repo: 'cli-browser-act-skills' }, { owner: 'browseract-cli', repo: 'browser-act-skills' }] },
  ];
  const res = await expander.expand(entries, 2);
  // maxSkills=2：轮询覆盖 ai-and-llms 与 devops-and-cloud 各 1 个
  assert.equal(res.stats.totalEntries, 4);
  assert.equal(res.stats.attempted, 2);
  assert.equal(res.stats.fetched, 2);
  assert.equal(res.stats.failed, 0);
  assert.deepEqual(res.drafts.map(d => d.name), ['a1', 'b1']);
  assert.equal(res.drafts[0].category, 'ai-and-llms');
  assert.equal(res.drafts[0].sourceRepo, 'https://github.com/a1/a1');
  // 候选失败换下一个：展开单个条目验证
  const res2 = await expander.expand([entries[3]], 10);
  assert.equal(res2.stats.attempted, 1);
  assert.equal(res2.stats.fetched, 1);
  assert.equal(res2.drafts[0].name, 'browser-act');
  assert.equal(res2.drafts[0].sourceRepo, 'https://github.com/browseract-cli/browser-act-skills');
});

test('skill-catalog-expander: 全部拉取失败 → 空草稿 + 失败计数（不中断）', async () => {
  const fetcher: SkillRepoFetcher = { fetchSkillMd: async () => null };
  const expander = new SkillCatalogExpander(fetcher);
  const entries = [
    { name: 'x', description: '', category: 'cat', sourceUrl: 'https://clawskills.sh/skills/x-x', candidates: [{ owner: 'x', repo: 'x' }] },
    { name: 'y', description: '', category: 'cat', sourceUrl: 'https://clawskills.sh/skills/y-y', candidates: [{ owner: 'y', repo: 'y' }] },
  ];
  const res = await expander.expand(entries, 5);
  assert.equal(res.stats.totalEntries, 2);
  assert.equal(res.stats.attempted, 2);
  assert.equal(res.stats.fetched, 0);
  assert.equal(res.stats.failed, 2);
  assert.deepEqual(res.drafts, []);
});