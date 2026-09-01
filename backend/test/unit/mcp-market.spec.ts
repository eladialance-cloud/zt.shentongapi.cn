/**
 * MCP 市场链路单元测试
 * 运行: node -r ts-node/register --test test/unit/mcp-market.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMcpPackage } from '../../src/modules/market/packagers/package-builder';
import { McpCatalogEntity } from '../../src/modules/admin-mcp/entities/mcp-catalog.entity';
import { AdminMcpCatalogService } from '../../src/modules/admin-mcp/admin-mcp-catalog.service';
import {
  assertMcpCommandSafe,
  buildStdioProbePlan,
  isPrivateLiteralIp,
} from '../../src/modules/mcp/utils/mcp-security';
import { MarketService } from '../../src/modules/market/market.service';

describe('buildMcpPackage', () => {
  it('生成 mcp 类型市场包', () => {
    const c = new McpCatalogEntity();
    c.id = 1 as never;
    c.name = 'filesystem';
    c.runtime = 'node';
    c.transportType = 'stdio';
    c.command = 'npx';
    c.args = ['-y', '@modelcontextprotocol/server-filesystem'];
    c.version = '1.0.0';
    const pkg = buildMcpPackage(c);
    assert.equal(pkg.type, 'mcp');
    assert.equal((pkg.payload as any).mcp.name, 'filesystem');
    assert.equal((pkg.payload as any).mcp.command, 'npx');
    assert.deepEqual((pkg.payload as any).mcp.args, [
      '-y',
      '@modelcontextprotocol/server-filesystem',
    ]);
    assert.equal((pkg.payload as any).mcp.version, '1.0.0');
  });
});

describe('AdminMcpCatalogService 命令白名单', () => {
  it('拒绝白名单外命令前缀', async () => {
    const service = new AdminMcpCatalogService({} as never);
    await assert.rejects(
      () =>
        service.create({
          name: 'x',
          runtime: 'node',
          transportType: 'stdio',
          command: 'sh -c evil',
        } as never),
      /单个命令词/,
    );
  });

  it('允许 npx/uvx/docker 前缀命令并落库', async () => {
    const service = new AdminMcpCatalogService({} as never);
    const saved: McpCatalogEntity[] = [];
    const spy = {
      create: (dto: McpCatalogEntity) => dto,
      save: async (entity: McpCatalogEntity) => {
        saved.push(entity);
        return entity;
      },
    };
    (service as any).repo = spy;
    for (const command of ['npx', 'uvx', 'docker']) {
      const result = await service.create({
        name: 'x',
        runtime: 'node',
        transportType: 'stdio',
        command,
        args: command === 'docker' ? ['run', 'image'] : undefined,
        version: '1.0.0',
      } as never);
      assert.ok(result);
    }
    assert.equal(saved.length, 3);
    assert.deepEqual(
      saved.map((s) => s.command),
      ['npx', 'uvx', 'docker'],
    );
    assert.ok(saved.every((s) => s.enabled === true));
    assert.equal(saved[0].version, '1.0.0');
  });
});

describe('mcp-security 命令安全', () => {
  const rejects = (command: string | undefined, args: string[] | undefined, re: RegExp) => {
    assert.throws(() => assertMcpCommandSafe(command, args), re);
  };
  const accepts = (command: string, args: string[]) => {
    assert.doesNotThrow(() => assertMcpCommandSafe(command, args));
  };

  it('拒绝 python -c/-i', () => {
    rejects('python', ['-c', 'print(1)'], /危险参数/);
    rejects('python', ['-i'], /危险参数/);
    rejects('python3', ['-c', 'print(1)'], /危险参数/);
  });

  it('拒绝 node 危险短 flag 与长 flag', () => {
    rejects('node', ['-e', 'console.log(1)'], /危险参数/);
    rejects('node', ['-p'], /危险参数/);
    rejects('node', ['-r', './evil.js'], /危险参数/);
    rejects('node', ['--eval=console.log(1)'], /危险参数/);
    rejects('node', ['--print'], /危险参数/);
    rejects('node', ['--inspect'], /危险参数/);
    rejects('node', ['--inspect-brk=9229'], /危险参数/);
  });

  it('拒绝 npx/uvx -c/--call/--shell/--exec', () => {
    rejects('npx', ['-c', 'evil'], /危险参数/);
    rejects('npx', ['--call', 'evil'], /危险参数/);
    rejects('uvx', ['--shell', 'evil'], /危险参数/);
    rejects('uvx', ['--exec', 'evil'], /危险参数/);
  });

  it('拒绝 docker 非 run / 危险 flag / 无镜像名', () => {
    rejects('docker', ['exec', 'x'], /必须以 run 开始/);
    rejects('docker', ['run', '-v', '/etc:/etc', 'image'], /仅允许 -e/);
    rejects('docker', ['run', '--privileged', 'image'], /仅允许 -e/);
    rejects('docker', ['run', '--network', 'host', 'image'], /仅允许 -e/);
    rejects('docker', ['run', '--mount', 'type=bind,src=/etc,target=/etc', 'image'], /仅允许 -e/);
    rejects('docker', ['run', '-p', '80:80', 'image'], /仅允许 -e/);
    rejects('docker', ['run'], /必须包含镜像名/);
  });

  it('拒绝多 token command、控制字符与白名单外 base', () => {
    rejects('sh -c evil', undefined, /单个命令词/);
    rejects('node\n-e', undefined, /单个命令词/);
    rejects('node\u0001', undefined, /控制字符/);
    rejects('bash', undefined, /白名单/);
    rejects('cmd.exe', undefined, /白名单/);
  });

  it('接受 npx -y pkg / python -m module / 脚本 / node 脚本', () => {
    accepts('npx', ['-y', '@modelcontextprotocol/server-filesystem']);
    accepts('python', ['-m', 'mcp.server.sse']);
    accepts('python', ['server.py']);
    accepts('python3', ['-m', 'mcp.server.sse']);
    accepts('node', ['server.js']);
  });

  it('接受 docker run -e K=V image（args 后允许任意非 flag）', () => {
    accepts('docker', ['run', '-e', 'K=V', 'image']);
    accepts('docker', ['run', '-eK=V', 'image', 'arg1', 'arg2']);
    accepts('docker', ['run', '--env', 'K=V', 'image']);
    accepts('docker', ['run', '--env=K=V', 'image']);
  });
});

describe('mcp-security SSRF', () => {
  it('私有/保留 IPv4 判定', () => {
    const privates = [
      '127.0.0.1',
      '10.0.0.1',
      '192.168.1.1',
      '172.16.0.1',
      '172.31.255.255',
      '169.254.0.1',
      '100.64.0.1',
      '100.127.255.255',
      '0.0.0.0',
    ];
    for (const ip of privates) {
      assert.equal(isPrivateLiteralIp(ip), true, ip + ' 应为私有');
    }
  });

  it('私有/保留 IPv6 判定', () => {
    const privates = [
      '::1',
      '::',
      'fc00::1',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '2001:db8::1',
      '64:ff9b::7f00:1',
      '64:ff9b::a00:1',
      '2002:7f00:1::',
      '2002:a00:1::',
      '::127.0.0.1',
      '::10.0.0.1',
    ];
    for (const ip of privates) {
      assert.equal(isPrivateLiteralIp(ip), true, ip + ' 应为私有');
    }
  });

  it('公网 IP 判定为可访问', () => {
    assert.equal(isPrivateLiteralIp('8.8.8.8'), false);
    assert.equal(isPrivateLiteralIp('2606:4700::1'), false);
  });
});

describe('buildStdioProbePlan', () => {
  it('custom 源不 allow 且 reason 引导本地 OpenClaw', () => {
    const plan = buildStdioProbePlan({ source: 'custom', env: {} });
    assert.equal(plan.allow, false);
    assert.match(plan.reason || '', /本地 OpenClaw/);
  });

  it('official 但缺少 catalogId 不 allow', () => {
    const plan = buildStdioProbePlan({ source: 'official' });
    assert.equal(plan.allow, false);
  });

  it('official 目录缺失或已禁用不 allow', () => {
    const missing = buildStdioProbePlan({ source: 'official', catalogId: 1 }, null);
    assert.equal(missing.allow, false);
    assert.match(missing.reason || '', /不存在或已下架/);
    const disabled = buildStdioProbePlan(
      { source: 'official', catalogId: 1 },
      { enabled: false, command: 'npx' },
    );
    assert.equal(disabled.allow, false);
  });

  it('official + 启用目录且命令安全 → allow 且 command 取目录值', () => {
    const plan = buildStdioProbePlan(
      { source: 'official', catalogId: 7, env: { A: '1' } },
      { enabled: true, command: 'python', args: ['-m', 'mcp.server.sse'] },
    );
    assert.equal(plan.allow, true);
    assert.equal(plan.command, 'python');
    assert.deepEqual(plan.args, ['-m', 'mcp.server.sse']);
    assert.deepEqual(plan.env, { A: '1' });
  });

  it('official 目录命令危险 → 不 allow 且 reason 为校验错误', () => {
    const plan = buildStdioProbePlan(
      { source: 'official', catalogId: 7 },
      { enabled: true, command: 'python', args: ['-c', 'print(1)'] },
    );
    assert.equal(plan.allow, false);
    assert.match(plan.reason || '', /危险参数/);
  });
});

describe('MarketService.getDownloadPackage mcp 分支', () => {
  function makeCatalog(): McpCatalogEntity {
    const c = new McpCatalogEntity();
    c.id = 5 as never;
    c.name = 'filesystem';
    c.runtime = 'node';
    c.transportType = 'stdio';
    c.command = 'npx';
    c.args = ['-y', '@modelcontextprotocol/server-filesystem'];
    c.version = '1.0.0';
    c.downloadCount = 0;
    return c;
  }

  function makeService(opts: { existing?: boolean }) {
    const catalog = makeCatalog();
    const catalogRepo = {
      findOne: async () => catalog,
      increment: async () => catalog,
    };
    const increments: number[] = [];
    let serverSeq = 100;
    const manager = {
      create: (_cls: unknown, plain: unknown) => plain,
      save: async (_cls: unknown, entity: unknown) => {
        serverSeq += 1;
        return { ...(entity as object), id: serverSeq };
      },
      increment: async (_cls: unknown, _where: unknown, _field: string, value: number) => {
        increments.push(value);
      },
    };
    const mcpServerRepo = {
      manager: {
        transaction: async (fn: (m: typeof manager) => unknown) => fn(manager),
      },
      findOne: async () => (opts.existing ? { id: 42 } : null),
    };
    const service = new MarketService(
      {} as never, // purchasedRepo
      {} as never, // skillRepo
      {} as never, // pluginRepo
      {} as never, // workflowRepo
      {} as never, // agentRepo
      catalogRepo as never,
      mcpServerRepo as never,
      {} as never, // creditsService
    );
    return { service, increments };
  }

  it('首次下载创建记录并递增 downloadCount', async () => {
    const { service, increments } = makeService({ existing: false });
    const result = await service.getDownloadPackage(1, 'mcp', 5);
    assert.ok(result.mcpServerId, '应创建 eco_mcp_servers 记录');
    assert.equal(increments.length, 1);
    assert.equal(increments[0], 1);
  });

  it('再次下载复用已有记录且不递增', async () => {
    const { service, increments } = makeService({ existing: true });
    const result = await service.getDownloadPackage(1, 'mcp', 5);
    assert.equal(result.mcpServerId, 42);
    assert.equal(increments.length, 0);
  });
});