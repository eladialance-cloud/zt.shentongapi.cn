import { Injectable } from '@nestjs/common';

@Injectable()
export class McpService {
  health() {
    return { status: 'ok', module: 'mcp' };
  }

  async getInfo(userId: number) {
    return { name: 'MCP Service', version: '1.0.0' };
  }

  async listServers(userId: number, keyword?: string) {
    return [];
  }

  async getServer(userId: number, id: number) {
    return { id, name: 'MCP Server', url: 'http://localhost:3100' };
  }

  async createServer(userId: number, dto: any) {
    return { id: Date.now(), ...dto };
  }

  async updateServer(userId: number, id: number, dto: any) {
    return { id, ...dto };
  }

  async deleteServer(userId: number, id: number) {
    return { success: true };
  }

  async probeServer(userId: number, serverId: number) {
    return { status: 'connected', latency: 0 };
  }

  async listTools(userId: number, serverId: number) {
    return [];
  }

  async callTool(userIdOrOptions: any, options?: any) {
    return { result: null };
  }
}