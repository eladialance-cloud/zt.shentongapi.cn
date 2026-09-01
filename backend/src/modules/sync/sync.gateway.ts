import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
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
export class SyncGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  private readonly logger = new Logger(SyncGateway.name);

  constructor(private jwtService: JwtService, private readonly config: ConfigService) {}

  @WebSocketServer()
  server: Server;

  /**
   * 多实例部署：挂载 socket.io Redis adapter（依赖 @socket.io/redis-adapter，未安装/Redis 不可用则回退内存模式）
   * 单实例部署无需 Redis，此逻辑自动跳过。
   */
  afterInit(server: Server): void {
    const url = this.config.get<string>('REDIS_URL', '');
    if (!url) {
      this.logger.log('[sync] REDIS_URL 未配置，单实例模式（不挂载 Redis adapter）');
      return;
    }
    let pubClient: any = null;
    let subClient: any = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createAdapter } = require('@socket.io/redis-adapter');
      const Redis = require('ioredis').default || require('ioredis');
      pubClient = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3, enableOfflineQueue: false });
      subClient = pubClient.duplicate();
      Promise.all([pubClient.connect(), subClient.connect()])
        .then(() => {
          // 版本不兼容（旧 socket.io/旧 node_modules）时 server.adapter 可能不存在，跳过即可
          if (typeof (server as any).adapter !== 'function') {
            this.logger.warn('[sync] 当前 socket.io 版本不支持挂载 Redis adapter，回退内存模式');
            this.safeDisconnect(pubClient);
            this.safeDisconnect(subClient);
            return;
          }
          server.adapter(createAdapter(pubClient, subClient));
          this.logger.log('[sync] socket.io Redis adapter 已挂载（多实例广播可用）');
        })
        .catch((err: Error) => {
          this.logger.warn(`[sync] Redis 连接失败，回退内存模式: ${err.message}`);
          this.safeDisconnect(pubClient);
          this.safeDisconnect(subClient);
        });
    } catch (err) {
      this.logger.warn(`[sync] @socket.io/redis-adapter 未安装，回退内存模式: ${(err as Error).message}（安装：cd backend && npm install）`);
    }
  }

  /**
   * 安全断开 Redis 客户端：ioredis disconnect() 为同步 void，直接 .catch 会因
   * undefined.catch 抛 TypeError 导致 unhandledRejection 崩溃（生产环境已复现）
   */
  private safeDisconnect(client: any): void {
    if (!client) return;
    try {
      const result = client.disconnect();
      if (result && typeof result.catch === 'function') {
        result.catch(() => undefined);
      }
    } catch (err) {
      this.logger.debug(`[sync] Redis 客户端断开忽略: ${(err as Error).message}`);
    }
  }

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

  /** remote:result 客户端事件监听器（由 RemoteService 注册，用于执行结果回传飞书） */
  private remoteResultListeners: Array<(userId: number, payload: unknown) => void> = [];

  /** 注册 remote:result 监听器 */
  onRemoteResult(listener: (userId: number, payload: unknown) => void): void {
    this.remoteResultListeners.push(listener);
  }

  /** 判断用户是否有在线设备（房间内存在 socket） */
  async isUserOnline(userId: number): Promise<boolean> {
    if (!this.server) return false;
    try {
      const sockets = await this.server.in(`user:${userId}`).fetchSockets();
      return sockets.length > 0;
    } catch (err) {
      this.logger.debug(`[sync] isUserOnline(${userId}) 异常: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * 桌面端回传命令执行结果（remote:result 事件）
   * payload: { commandId, status, progress?, message?, description?, data?, replyContext? }
   */
  @SubscribeMessage('remote:result')
  handleRemoteResult(client: Socket, payload: unknown): void {
    const userId = (client as any)?.userId as number | undefined;
    if (!userId) return;
    for (const listener of this.remoteResultListeners) {
      try {
        listener(userId, payload);
      } catch (err) {
        this.logger.error(`[sync] remote:result 监听器异常: ${(err as Error).message}`);
      }
    }
  }
  /** 广播事件（所有连接） */
  broadcast(event: string, data: unknown): void {
    if (!this.server) {
      return;
    }
    this.server.emit(event, data);
  }
}