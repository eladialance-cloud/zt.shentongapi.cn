import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'node:path';
import { McpServerEntity } from '../entities/mcp-server.entity';
import { RedisService } from '../../../common/services/redis.service';

/**
 * MCP 宸ュ叿璋冪敤璇锋眰 DTO
 */
interface CallToolData {
  serverId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 璇锋眰缁撴瀯
 */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 鍝嶅簲缁撴瀯
 */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * MCP Server 鏈嶅姟
 * 鏀寔閫氳繃 stdio / http / streamable-http 浼犺緭鏂瑰紡杩炴帴 MCP Server锛? * 鍒楀嚭鍙敤宸ュ叿骞惰皟鐢ㄥ伐鍏锋墽琛屻€? */
@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);
  private static readonly TOOLS_CACHE_TTL = 300; // 5 鍒嗛挓
  private static readonly STDIO_TIMEOUT = 15000; // stdio 閫氫俊瓒呮椂 15s
  private static readonly HTTP_TIMEOUT = 10000; // HTTP 璇锋眰瓒呮椂 10s

  /** 鍏佽鎵ц鐨勫懡浠ょ櫧鍚嶅崟 */
  private static readonly ALLOWED_COMMANDS = [
    'node', 'npx', 'npm',
    'python', 'python3', 'pip', 'pip3', 'uv',
    'go',
    'java',
    'ruby',
    'php',
    'curl',
    'bash', 'sh',
  ];

  constructor(
    @InjectRepository(McpServerEntity)
    private readonly serverRepo: Repository<McpServerEntity>,
    private readonly redis: RedisService,
  ) {}

  /** 鍋ュ悍妫€鏌?*/
  health() {
    return { status: 'ok', module: 'mcp' };
  }

  /**
   * 鏍￠獙鍛戒护鏄惁鍦ㄧ櫧鍚嶅崟涓?   */
  private validateCommand(command: string): void {
    const baseCommand = path.basename(command).toLowerCase();
    // 鍘婚櫎 .exe 鍚庣紑
    const normalized = baseCommand.replace(/\.exe$/, '');
    if (!McpService.ALLOWED_COMMANDS.includes(normalized)) {
      throw new BadRequestException(
        `涓嶅厑璁哥殑鍛戒护: ${command}銆傚厑璁哥殑鍛戒护: ${McpService.ALLOWED_COMMANDS.join(', ')}`,
      );
    }
  }

  /**
   * 鏍￠獙鍙傛暟鏁扮粍涓笉鍚嵄闄╁瓧绗?   */
  private validateArgs(args: string[]): void {
    const dangerousPatterns = /[;&|`$(){}!#<>\\"'\n\r]/;
    for (const arg of args) {
      if (dangerousPatterns.test(arg)) {
        throw new BadRequestException(
          `鍙傛暟鍖呭惈鍗遍櫓瀛楃: ${arg.substring(0, 50)}`,
        );
      }
    }
  }

  /** 鑾峰彇鐢ㄦ埛鐨勬墍鏈?MCP Server 閰嶇疆 */
  async listServers(userId: number): Promise<McpServerEntity[]> {
    return this.serverRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /** 鍒涘缓 MCP Server 閰嶇疆 */
  async createServer(
    userId: number,
    data: Partial<McpServerEntity>,
  ): Promise<McpServerEntity> {
    // 鏍￠獙蹇呭～瀛楁
    if (!data.name) {
      throw new HttpException('鍚嶇О涓嶈兘涓虹┖', HttpStatus.BAD_REQUEST);
    }
    if (!data.transportType) {
      throw new HttpException('浼犺緭绫诲瀷涓嶈兘涓虹┖', HttpStatus.BAD_REQUEST);
    }

    // 鏍规嵁浼犺緭绫诲瀷鏍￠獙瀛楁
    this.validateTransportFields(data);

    const server = this.serverRepo.create({
      ...data,
      userId,
      status: 'pending',
      toolCount: 0,
    });
    const saved = await this.serverRepo.save(server);
    this.logger.log(`鐢ㄦ埛 ${userId} 鍒涘缓 MCP Server: ${saved.name}(${saved.id})`);
    return saved;
  }

  /** 鏇存柊 MCP Server 閰嶇疆 */
  async updateServer(
    userId: number,
    serverId: string,
    data: Partial<McpServerEntity>,
  ): Promise<McpServerEntity> {
    const server = await this.findUserServer(userId, serverId);

    // 鏍规嵁浼犺緭绫诲瀷鏍￠獙瀛楁
    if (data.transportType || data.command || data.url) {
      this.validateTransportFields({ ...server, ...data });
    }

    await this.serverRepo.update(server.id, data);

    // 娓呴櫎宸ュ叿缂撳瓨
    await this.redis.del(this.getToolsCacheKey(server.id));

    // 鏇存柊鍚庨噸缃姸鎬佷负 pending
    if (data.transportType || data.command || data.url || data.args) {
      await this.serverRepo.update(server.id, { status: 'pending' });
    }

    const updated = await this.serverRepo.findOne({ where: { id: server.id } });
    if (!updated) {
      throw new HttpException('鏇存柊鍚庢湇鍔″櫒涓嶅瓨鍦?, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return updated;
  }

  /** 鍒犻櫎 MCP Server 閰嶇疆 */
  async deleteServer(userId: number, serverId: string): Promise<void> {
    const server = await this.findUserServer(userId, serverId);
    await this.serverRepo.delete(server.id);
    await this.redis.del(this.getToolsCacheKey(server.id));
    this.logger.log(`鐢ㄦ埛 ${userId} 鍒犻櫎 MCP Server: ${server.name}(${server.id})`);
  }

  /** 鑾峰彇鎸囧畾 Server 鐨勫伐鍏峰垪琛紙甯?Redis 缂撳瓨锛?*/
  async listTools(userId: number, serverId: string): Promise<unknown[]> {
    const server = await this.findUserServer(userId, serverId);

    if (!server.enabled) {
      throw new HttpException('MCP Server 宸茬鐢?, HttpStatus.BAD_REQUEST);
    }

    // 灏濊瘯浠庣紦瀛樿鍙?    const cacheKey = this.getToolsCacheKey(server.id);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as unknown[];
      } catch {
        // 缂撳瓨鎹熷潖锛岀户缁疄鏃舵煡璇?      }
    }

    // 瀹炴椂鏌ヨ宸ュ叿鍒楄〃
    const tools = await this.fetchToolsList(server);

    // 缂撳瓨缁撴灉
    await this.redis.set(cacheKey, JSON.stringify(tools), McpService.TOOLS_CACHE_TTL);

    return tools;
  }

  /** 璋冪敤 MCP 宸ュ叿 */
  async callTool(userId: number, data: CallToolData): Promise<unknown> {
    const server = await this.findUserServer(userId, data.serverId);

    if (!server.enabled) {
      throw new HttpException('MCP Server 宸茬鐢?, HttpStatus.BAD_REQUEST);
    }

    if (!data.toolName) {
      throw new HttpException('宸ュ叿鍚嶇О涓嶈兘涓虹┖', HttpStatus.BAD_REQUEST);
    }

    const result = await this.invokeTool(server, data.toolName, data.args || {});
    return result;
  }

  /** 娴嬭瘯杩炴帴骞惰繑鍥炲伐鍏峰垪琛?*/
  async probeServer(userId: number, serverId: string): Promise<{
    status: string;
    toolCount: number;
    tools: unknown[];
  }> {
    const server = await this.findUserServer(userId, serverId);

    // 娓呴櫎鏃х紦瀛?    await this.redis.del(this.getToolsCacheKey(server.id));

    try {
      const tools = await this.fetchToolsList(server);

      // 鏇存柊杩炴帴鐘舵€?      await this.serverRepo.update(server.id, {
        status: 'connected',
        lastConnectedAt: new Date(),
        toolCount: Array.isArray(tools) ? tools.length : 0,
      });

      // 缂撳瓨缁撴灉
      await this.redis.set(
        this.getToolsCacheKey(server.id),
        JSON.stringify(tools),
        McpService.TOOLS_CACHE_TTL,
      );

      return {
        status: 'connected',
        toolCount: Array.isArray(tools) ? tools.length : 0,
        tools,
      };
    } catch (err) {
      // 鏇存柊鐘舵€佷负澶辫触
      await this.serverRepo.update(server.id, { status: 'failed' });
      throw new HttpException(
        `杩炴帴澶辫触: ${err instanceof Error ? err.message : String(err)}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ============================================================
  // 绉佹湁鏂规硶
  // ============================================================

  /** 鏌ユ壘鐢ㄦ埛鎷ユ湁鐨?Server锛屼笉瀛樺湪鍒欐姏 404 */
  private async findUserServer(
    userId: number,
    serverId: string,
  ): Promise<McpServerEntity> {
    const id = Number(serverId);
    if (Number.isNaN(id)) {
      throw new HttpException('鏃犳晥鐨?Server ID', HttpStatus.BAD_REQUEST);
    }

    const server = await this.serverRepo.findOne({
      where: { id, userId },
    });

    if (!server) {
      throw new HttpException('MCP Server 涓嶅瓨鍦?, HttpStatus.NOT_FOUND);
    }

    return server;
  }

  /** 鏍￠獙浼犺緭绫诲瀷鐩稿叧瀛楁 */
  private validateTransportFields(data: Partial<McpServerEntity>): void {
    const transportType = data.transportType;
    if (transportType === 'stdio') {
      if (!data.command) {
        throw new HttpException(
          'stdio 妯″紡闇€瑕佹彁渚?command 瀛楁',
          HttpStatus.BAD_REQUEST,
        );
      }
    } else if (transportType === 'http' || transportType === 'streamable-http') {
      if (!data.url) {
        throw new HttpException(
          `${transportType} 妯″紡闇€瑕佹彁渚?url 瀛楁`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }

  /** 鑾峰彇宸ュ叿鍒楄〃缂撳瓨 key */
  private getToolsCacheKey(serverId: number): string {
    return `mcp:tools:${serverId}`;
  }

  /** 閫氳繃 MCP 鍗忚鑾峰彇宸ュ叿鍒楄〃 */
  private async fetchToolsList(server: McpServerEntity): Promise<unknown[]> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    };

    const response = await this.sendMcpRequest(server, request);

    if (response.error) {
      throw new Error(`MCP tools/list 閿欒: ${response.error.message}`);
    }

    const result = response.result as { tools?: unknown[] } | null;
    return result?.tools ?? [];
  }

  /** 閫氳繃 MCP 鍗忚璋冪敤宸ュ叿 */
  private async invokeTool(
    server: McpServerEntity,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    };

    const response = await this.sendMcpRequest(server, request);

    if (response.error) {
      throw new HttpException(
        `MCP tools/call 閿欒: ${response.error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    return response.result;
  }

  /**
   * 鏍规嵁 Server 浼犺緭绫诲瀷鍙戦€?MCP JSON-RPC 璇锋眰
   */
  private async sendMcpRequest(
    server: McpServerEntity,
    request: JsonRpcRequest,
  ): Promise<JsonRpcResponse> {
    switch (server.transportType) {
      case 'stdio':
        return this.sendStdioRequest(server, request);
      case 'http':
      case 'streamable-http':
        return this.sendHttpRequest(server, request);
      default:
        throw new Error(`涓嶆敮鎸佺殑浼犺緭绫诲瀷: ${server.transportType}`);
    }
  }

  /**
   * stdio 妯″紡锛歴pawn 瀛愯繘绋嬶紝閫氳繃 stdin/stdout 閫氫俊
   * MCP 鍗忚瑕佹眰鍏堝彂閫?initialize 璇锋眰锛屽啀鍙戦€佸疄闄呰姹?   */
  private async sendStdioRequest(
    server: McpServerEntity,
    request: JsonRpcRequest,
  ): Promise<JsonRpcResponse> {
    if (!server.command) {
      throw new Error('stdio 妯″紡缂哄皯 command 閰嶇疆');
    }

    // 鍛戒护鐧藉悕鍗曟牎楠?    this.validateCommand(server.command);

    const args = server.args ?? [];
    // 鍙傛暟瀹夊叏鏍￠獙
    this.validateArgs(args);

    const env = { ...process.env, ...(server.env ?? {}) } as NodeJS.ProcessEnv;

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      let child: ChildProcess;
      try {
        child = spawn(server.command!, args, {
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err) {
        reject(new Error(`鍚姩瀛愯繘绋嬪け璐? ${err instanceof Error ? err.message : String(err)}`));
        return;
      }

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`stdio 閫氫俊瓒呮椂 (${McpService.STDIO_TIMEOUT}ms)`));
      }, McpService.STDIO_TIMEOUT);

      let stdoutBuffer = '';
      let stderrBuffer = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdoutBuffer += data.toString('utf-8');
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderrBuffer += data.toString('utf-8');
      });

      child.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(new Error(`瀛愯繘绋嬮敊璇? ${err.message}`));
      });

      child.on('close', (code: number | null) => {
        clearTimeout(timeout);

        if (code !== 0 && !stdoutBuffer) {
          reject(
            new Error(
              `瀛愯繘绋嬮€€鍑?code=${code})${stderrBuffer ? ': ' + stderrBuffer.trim() : ''}`,
            ),
          );
          return;
        }

        const response = this.parseJsonRpcResponse(stdoutBuffer, server.id);
        if (response) {
          resolve(response);
        } else {
          reject(new Error(`鏃犳硶瑙ｆ瀽 MCP 鍝嶅簲: ${stdoutBuffer.substring(0, 500)}`));
        }
      });

      // 鍐欏叆 JSON-RPC 璇锋眰鍒板瓙杩涚▼ stdin
      const jsonLine = JSON.stringify(request) + '\n';
      try {
        child.stdin?.write(jsonLine);
        child.stdin?.end();
      } catch (err) {
        clearTimeout(timeout);
        child.kill('SIGTERM');
        reject(new Error(`鍐欏叆 stdin 澶辫触: ${err instanceof Error ? err.message : String(err)}`));
      }
    });
  }

  /**
   * HTTP / streamable-http 妯″紡锛歅OST JSON-RPC 璇锋眰鍒版湇鍔″櫒 URL
   */
  private async sendHttpRequest(
    server: McpServerEntity,
    request: JsonRpcRequest,
  ): Promise<JsonRpcResponse> {
    if (!server.url) {
      throw new Error(`${server.transportType} 妯″紡缂哄皯 url 閰嶇疆`);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(server.headers ?? {}),
    };

    // streamable-http 妯″紡鍙兘闇€瑕侀澶栫殑 Accept 澶?    if (server.transportType === 'streamable-http') {
      headers['Accept'] = 'application/json, text/event-stream';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), McpService.HTTP_TIMEOUT);

    try {
      const res = await fetch(server.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
      }

      const contentType = res.headers.get('content-type') ?? '';

      // 澶勭悊 SSE (text/event-stream) 鍝嶅簲
      if (contentType.includes('text/event-stream')) {
        const text = await res.text();
        return this.parseSseResponse(text);
      }

      // 鏅€?JSON 鍝嶅簲
      const json = (await res.json()) as JsonRpcResponse;
      return json;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(`HTTP 璇锋眰瓒呮椂 (${McpService.HTTP_TIMEOUT}ms)`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 浠?stdout 鏂囨湰涓В鏋?JSON-RPC 鍝嶅簲
   * MCP stdio 妯″紡鍙兘杈撳嚭澶氳锛岄渶鎵惧埌鍖呭惈 JSON-RPC 鍝嶅簲鐨勮
   */
  private parseJsonRpcResponse(
    text: string,
    serverId: number,
  ): JsonRpcResponse | null {
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed) as JsonRpcResponse;
        if (
          parsed.jsonrpc === '2.0' &&
          (parsed.result !== undefined || parsed.error !== undefined)
        ) {
          return parsed;
        }
      } catch {
        // 璺宠繃闈?JSON 琛岋紙鍙兘鏄棩蹇楄緭鍑猴級
        continue;
      }
    }

    // 灏濊瘯鏁翠綋瑙ｆ瀽
    try {
      const parsed = JSON.parse(text.trim()) as JsonRpcResponse;
      if (
        parsed.jsonrpc === '2.0' &&
        (parsed.result !== undefined || parsed.error !== undefined)
      ) {
        return parsed;
      }
    } catch {
      // 蹇界暐
    }

    this.logger.warn(`Server ${serverId} 鏃犳硶瑙ｆ瀽鍝嶅簲: ${text.substring(0, 200)}`);
    return null;
  }

  /**
   * 瑙ｆ瀽 SSE (Server-Sent Events) 鏍煎紡鐨勫搷搴?   * 鏍煎紡: data: {"jsonrpc":"2.0",...}\n\n
   */
  private parseSseResponse(text: string): JsonRpcResponse {
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data:')) {
        const jsonStr = trimmed.slice(5).trim();
        try {
          return JSON.parse(jsonStr) as JsonRpcResponse;
        } catch {
          continue;
        }
      }
    }

    // 鍥為€€锛氬皾璇曠洿鎺ヨВ鏋愭暣涓枃鏈?    try {
      return JSON.parse(text.trim()) as JsonRpcResponse;
    } catch {
      throw new Error(`鏃犳硶瑙ｆ瀽 SSE 鍝嶅簲: ${text.substring(0, 200)}`);
    }
  }
}
