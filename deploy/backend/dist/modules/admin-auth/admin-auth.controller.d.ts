import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto, AdminChangePasswordDto } from './dto/login.dto';
export declare class AdminAuthController {
    private readonly service;
    constructor(service: AdminAuthService);
    login(dto: AdminLoginDto): Promise<import("./admin-auth.service").AdminLoginResult>;
    logout(req: any): Promise<null>;
    profile(req: any): Promise<{
        user: {
            id: number;
            username: string;
            email: string;
            avatar: string | undefined;
            roleIds: number[];
            roleCodes: string[];
            status: "active" | "disabled";
            createdAt: Date;
            updatedAt: Date;
        };
        permissions: string[];
    }>;
    changePassword(req: any, dto: AdminChangePasswordDto): Promise<null>;
}
