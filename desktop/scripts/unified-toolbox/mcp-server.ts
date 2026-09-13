import * as http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";

import type { ToolDef, ToolRegistry } from "./registry";
import { loadToolRegistry, validateRegistry } from "./registry";
import type { CapabilityFn } from "./toolbox";
import { dispatchTool } from "./toolbox";
import { executeFeishu, executeMysql } from "./capabilities";

const SERVER_NAME = "unified-toolbox";
const SERVER_VERSION = "2.0.11";
const PROTOCOL_VERSION = "2024-11-05";
const DEFAULT_PORT = 9010;

const INITIALIZE_RESULT = {
  protocolVersion: PROTOCOL_VERSION,
  capabilities: { tools: {} },
  serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
};

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

/** MCP 分派依赖：注册表 + 已注册 capability 集合。 */
export interface McpDeps {
  registry: ToolRegistry;
  capabilities: Record<string, CapabilityFn>;
}

/**
 * 处理单条 JSON-RPC 2.0 请求。
 * - initialize 返回协议/能力/服务信息；
 * - tools/list 返回注册工具列表；
 * - tools/call 调用 dispatchTool 并把 `{ok,data,error}` 映射为 MCP content/isError；
 * - 其它方法返回 JSON-RPC error。
 * 无 id 的通知不返回响应；tools/call 因 capability 为异步而返回 Promise。
 */
export function handleMcpJsonRpc(msg: unknown, deps: McpDeps): unknown {
  const req = parseRequest(msg);
  if (!req) {
    return errorResponse(null, -32600, "Invalid Request");
  }
  if (req.id === undefined) {
    return undefined;
  }

  switch (req.method) {
    case "initialize":
      return successResponse(req.id, INITIALIZE_RESULT);
    case "tools/list":
      return successResponse(req.id, listTools(deps.registry));
    case "tools/call":
      return handleToolsCall(req.id, req.params, deps);
    default:
      return errorResponse(req.id, -32601, `Method not found: ${req.method}`);
  }
}

function parseRequest(msg: unknown): JsonRpcRequest | null {
  if (!isRecord(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return null;
  }
  const id =
    msg.id === undefined ? undefined
    : typeof msg.id === "string" || typeof msg.id === "number" || msg.id === null
      ? msg.id
      : null;
  return { jsonrpc: "2.0", id, method: msg.method, params: msg.params };
}

function successResponse(id: JsonRpcId, result: unknown): unknown {
  return { jsonrpc: "2.0", id, result };
}

function errorResponse(id: JsonRpcId, code: number, message: string): unknown {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function listTools(registry: ToolRegistry): unknown {
  return { tools: registry.tools.map(toMcpTool) };
}

function toMcpTool(tool: ToolDef): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const param of tool.params) {
    properties[param] = { type: "string" };
  }
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: {
      type: "object",
      properties,
      required: tool.params.length > 0 ? [...tool.params] : undefined,
    },
  };
}

function handleToolsCall(id: JsonRpcId, params: unknown, deps: McpDeps): unknown {
  if (!isRecord(params) || typeof params.name !== "string" || !params.name) {
    return errorResponse(id, -32602, "Invalid params: name 缺失");
  }
  const args = isRecord(params.arguments) ? params.arguments : {};
  return dispatchTool(params.name, args, {
    capabilities: deps.capabilities,
    registry: deps.registry,
  }).then((out) =>
    successResponse(id, {
      content: [{ type: "text", text: toText(out) }],
      isError: !out.ok,
    }),
  );
}

function toText(out: { ok: boolean; data?: unknown; error?: string }): string {
  if (out.error) {
    return out.error;
  }
  if (out.data === undefined) {
    return "ok";
  }
  return typeof out.data === "string" ? out.data : JSON.stringify(out.data);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** HTTP 服务句柄。 */
export interface McpServerHandle {
  close(): Promise<void>;
}

/** 以 node:http 启动 MCP HTTP 服务：POST /mcp 处理 JSON-RPC，GET /mcp 健康检查。 */
export function startMcpServer(port: number, deps: McpDeps): McpServerHandle {
  const server = http.createServer((req, res) => {
    handleHttp(req, res, deps).catch((err: unknown) => {
      writeJson(res, 500, { error: { message: err instanceof Error ? err.message : String(err) } });
    });
  });

  server.listen(port, "127.0.0.1");

  return {
    close(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        server.close((err?: Error) => (err ? reject(err) : resolve()));
      });
    },
  };
}

async function handleHttp(req: IncomingMessage, res: ServerResponse, deps: McpDeps): Promise<void> {
  if (req.method === "GET" && req.url === "/mcp") {
    writeJson(res, 200, { status: "ok", service: SERVER_NAME });
    return;
  }

  if (req.method === "POST" && req.url === "/mcp") {
    const body = await readBody(req);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      writeJson(res, 400, { error: { message: "Invalid JSON body" } });
      return;
    }
    const result = await handleMcpJsonRpc(parsed, deps);
    writeJson(res, 200, result ?? {});
    return;
  }

  writeJson(res, 404, { error: { message: "Not Found" } });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

interface CliArgs {
  port: number;
  registryPath: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  let port = DEFAULT_PORT;
  let registryPath: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--port") {
      const value = Number(argv[i + 1]);
      if (!Number.isFinite(value)) {
        throw new Error("--port 需要数字");
      }
      port = value;
      i++;
    } else if (arg === "--registry") {
      registryPath = argv[i + 1] ?? null;
      i++;
    } else if (arg === "--help" || arg === "-h") {
      console.log("用法: node mcp-server.ts --port <port> --registry <path/to/registry.yaml>");
      process.exit(0);
    }
  }
  return { port, registryPath };
}

function main(): void {
  try {
    const { port, registryPath } = parseArgs(process.argv.slice(2));
    if (!registryPath) {
      console.error("[unified-toolbox] 缺少 --registry 参数");
      process.exit(1);
    }
    const registry = loadToolRegistry(readFileSync(registryPath, "utf8"));
    const check = validateRegistry(registry);
    if (!check.ok) {
      console.error(`[unified-toolbox] registry 校验失败: ${check.errors.join("; ")}`);
      process.exit(1);
    }
    const deps: McpDeps = {
      registry,
      capabilities: { feishu: executeFeishu, mysql: executeMysql },
    };    const handle = startMcpServer(port, deps);
    console.log(`[unified-toolbox] MCP server listening on http://127.0.0.1:${port}/mcp`);
    const shutdown = (): void => {
      handle.close()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (err) {
    console.error(`[unified-toolbox] 启动失败: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

const invokedDirectly =
  typeof process !== "undefined" &&
  typeof process.argv?.[1] === "string" &&
  /(^|[\\/])mcp-server\.(ts|js)$/i.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
