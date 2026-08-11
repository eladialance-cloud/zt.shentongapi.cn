import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgentParser } from '../../src/modules/admin-imports/parsers/agent-parser';
import { WorkflowParser } from '../../src/modules/admin-imports/parsers/workflow-parser';
import { McpParser } from '../../src/modules/admin-imports/parsers/mcp-parser';
import { N8nMcpParser } from '../../src/modules/admin-imports/parsers/n8n-mcp-parser';
import { SkillParser } from '../../src/modules/admin-imports/parsers/skill-parser';
import { SkillPackParser } from '../../src/modules/admin-imports/parsers/skill-pack-parser';
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
