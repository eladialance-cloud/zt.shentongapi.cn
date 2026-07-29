import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
export declare class SyncGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private readonly jwtService;
    private readonly logger;
    constructor(jwtService: JwtService);
    server: Server;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    pushToUser(userId: number, event: string, data: unknown): void;
    broadcast(event: string, data: unknown): void;
}
