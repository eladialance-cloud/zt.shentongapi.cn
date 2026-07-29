import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

/**
 * 同步 WebSocket 网关：7 类推送通道
 * 数据合同真源：Task 31 - 数据同步设计
 * 推送事件：
 *   agent:updated / workflow:updated / plugin:updated / credits:updated /
 *   announcement:push / model:updated / user-level:updated
 * 客户端连接时按 userId 加入房间 user:<userId>，服务端按用户精准推送
 */
@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: 'sync',
})
export class SyncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SyncGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    // 从 auth / query / headers 提取 token
    const token =
      (client.handshake.auth as any)?.token ||
      (client.handshake.query as any)?.token ||
      this.extractBearerToken((client.handshake.headers as any)?.authorization);

    if (!token) {
      this.logger.warn(`客户端未携带 token，连接拒绝: ${client.id}`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify(token);
      const userId = payload.sub;
      if (!userId) {
        this.logger.warn(`token 中无 sub 字段，连接拒绝: ${client.id}`);
        client.disconnect(true);
        return;
      }
      const room = `user:${userId}`;
      client.join(room);
      this.logger.log(`客户端认证成功并加入房间 ${room}: ${client.id}`);
    } catch (err) {
      this.logger.warn(`JWT 验证失败，连接拒绝: ${client.id} - ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  /** 从 Bearer token 字符串中提取 token */
  private extractBearerToken(header: string | undefined): string | null {
    if (!header || typeof header !== 'string') return null;
    if (header.startsWith('Bearer ')) {
      return header.slice(7);
    }
    return header;
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`客户端断开: ${client.id}`);
  }

  /** 向指定用户推送事件 */
  pushToUser(userId: number, event: string, data: unknown): void {
    if (!this.server) {
      return;
    }
    this.server.to(`user:${userId}`).emit(event, data);
  }

  /** 广播事件（所有连接） */
  broadcast(event: string, data: unknown): void {
    if (!this.server) {
      return;
    }
    this.server.emit(event, data);
  }
}
