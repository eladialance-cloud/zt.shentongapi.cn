import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
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

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const userId =
      (client.handshake.auth as any)?.userId ||
      (client.handshake.query as any)?.userId;
    if (userId) {
      const room = `user:${userId}`;
      client.join(room);
      this.logger.log(`客户端连接并加入房间 ${room}: ${client.id}`);
    } else {
      this.logger.warn(`客户端未携带 userId，连接拒绝: ${client.id}`);
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
