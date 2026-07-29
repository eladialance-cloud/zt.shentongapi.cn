import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
export interface AdminJwtPayload {
    userId: number;
    username: string;
    role: 'admin';
}
declare const AdminAuthStrategy_base: new (...args: any[]) => Strategy;
export declare class AdminAuthStrategy extends AdminAuthStrategy_base {
    constructor(config: ConfigService);
    validate(payload: AdminJwtPayload): Promise<{
        id: number;
        username: string;
    }>;
}
export {};
