"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var SyncGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncGateway = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
let SyncGateway = SyncGateway_1 = class SyncGateway {
    jwtService;
    logger = new common_1.Logger(SyncGateway_1.name);
    constructor(jwtService) {
        this.jwtService = jwtService;
    }
    server;
    handleConnection(client) {
        let token = client.handshake.auth?.token ||
            client.handshake.query?.token;
        const authHeader = client.handshake.headers?.authorization;
        if (!token && authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.slice('Bearer '.length);
        }
        if (!token) {
            this.logger.warn(`客户端未携带 token，连接拒绝: ${client.id}`);
            client.emit('error', '未授权：缺少 token');
            client.disconnect(true);
            return;
        }
        try {
            const payload = this.jwtService.verify(token);
            const userId = payload.sub;
            const room = `user:${userId}`;
            client.join(room);
            this.logger.log(`客户端连接并加入房间 ${room}: ${client.id}`);
        }
        catch (err) {
            this.logger.warn(`token 验证失败，连接拒绝: ${client.id}`);
            client.emit('error', 'token 验证失败');
            client.disconnect(true);
        }
    }
    handleDisconnect(client) {
        this.logger.log(`客户端断开: ${client.id}`);
    }
    pushToUser(userId, event, data) {
        if (!this.server) {
            return;
        }
        this.server.to(`user:${userId}`).emit(event, data);
    }
    broadcast(event, data) {
        if (!this.server) {
            return;
        }
        this.server.emit(event, data);
    }
};
exports.SyncGateway = SyncGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], SyncGateway.prototype, "server", void 0);
exports.SyncGateway = SyncGateway = SyncGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: { origin: true, credentials: true },
        namespace: 'sync',
    }),
    __metadata("design:paramtypes", [jwt_1.JwtService])
], SyncGateway);
//# sourceMappingURL=sync.gateway.js.map