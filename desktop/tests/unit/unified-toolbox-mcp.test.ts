import { handleMcpJsonRpc } from "../../scripts/unified-toolbox/mcp-server";
import { loadToolRegistry } from "../../scripts/unified-toolbox/registry";
import { executeFeishu, executeMysql } from "../../scripts/unified-toolbox/capabilities";

const registry = loadToolRegistry(
  "tools:\n" +
    "  - name: feishu.create_table\n" +
    "    capability: feishu\n" +
    "    params: [table_name]\n" +
    "    description: 在飞书多维表格中创建数据表\n" +
    "  - name: mysql.query\n" +
    "    capability: mysql\n" +
    "    params: [sql]\n" +
    "    description: 执行 MySQL 查询并返回结果集\n",
);

const deps = {
  registry,
  capabilities: { feishu: executeFeishu, mysql: executeMysql },
};

describe("unified-toolbox mcp-server", () => {
  it("initialize 返回协议信息", async () => {
    const res = await handleMcpJsonRpc(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      deps,
    );
    expect(res).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: expect.any(String),
        capabilities: { tools: {} },
        serverInfo: { name: "unified-toolbox", version: expect.any(String) },
      },
    });
  });

  it("tools/list 返回工具列表", async () => {
    const res = await handleMcpJsonRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, deps);
    const r = res as { result: { tools: Array<Record<string, unknown>> } };
    expect(r.result.tools).toHaveLength(2);
    expect(r.result.tools[0]).toMatchObject({
      name: "feishu.create_table",
      description: "在飞书多维表格中创建数据表",
    });
    expect(r.result.tools[1]).toMatchObject({
      name: "mysql.query",
      description: "执行 MySQL 查询并返回结果集",
    });
  });

  it("tools/call 成功返回 content 且非错误", async () => {
    const fakeMysql = async (input: Record<string, unknown>) => ({ ok: true, data: { echo: input.sql } });
    const localDeps = { ...deps, capabilities: { ...deps.capabilities, mysql: fakeMysql } };
    const res = await handleMcpJsonRpc(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "mysql.query", arguments: { sql: "SELECT 1" } },
      },
      localDeps,
    );
    const r = res as {
      result: { content: Array<{ type: string; text: string }>; isError: boolean };
    };
    expect(r.result.isError).toBe(false);
    expect(r.result.content).toEqual([
      { type: "text", text: expect.stringContaining("SELECT 1") },
    ]);
  });

  it("tools/call 未命中返回 isError", async () => {
    const res = await handleMcpJsonRpc(
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "unknown.tool", arguments: {} },
      },
      deps,
    );
    const r = res as {
      result: { content: Array<{ type: string; text: string }>; isError: boolean };
    };
    expect(r.result.isError).toBe(true);
    expect(r.result.content).toEqual([
      { type: "text", text: expect.stringContaining("未找到") },
    ]);
  });

  it("未知方法返回 JSON-RPC error", async () => {
    const res = await handleMcpJsonRpc({ jsonrpc: "2.0", id: 5, method: "foo/bar" }, deps);
    const r = res as { error: { code: number; message: string } };
    expect(r.error.code).toBe(-32601);
  });
});
