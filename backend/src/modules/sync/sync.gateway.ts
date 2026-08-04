import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

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

  constructor(private jwtService: JwtService) {}

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth as any)?.token ||
        (client.handshake.query as any)?.token;
      if (!token) {
        this.logger.warn(`客户端未携带 token，连接拒绝: ${client.id}`);
        client.disconnect(true);
        return;
      }
      const payload = this.jwtService.verify(token) as { sub: number };
      if (!payload?.sub) {
        this.logger.warn(`无效的 token，连接拒绝: ${client.id}`);
        client.disconnect(true);
        return;
      }
      const room = `user:${payload.sub}`;
      client.join(room);
      (client as any).userId = payload.sub;
      this.logger.log(`客户端认证成功并加入房间 ${room}: ${client.id}`);
    } catch (err) {
      this.logger.warn(`Token 验证失败，连接拒绝: ${client.id} - ${(err as Error).message}`);
      client.disconnect(true);
    }
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