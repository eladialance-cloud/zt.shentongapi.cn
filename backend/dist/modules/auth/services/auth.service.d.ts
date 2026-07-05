import { ConfigService } from '@nestjs/config';
import { UserService } from '../../user/services/user.service';
import { EncryptionService } from '../../../common/services/encryption.service';
import { TokenService } from './token.service';
import { EmailService } from './email.service';
import { DeviceService } from '../../device/device.service';
import { InviteCodeService } from '../../user/invite-code.service';
import { RedisService } from '../../../common/services/redis.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
export declare class AuthService {
    private userService;
    private encryption;
    private tokenService;
    private emailService;
    private deviceService;
    private inviteCodeService;
    private redis;
    private config;
    constructor(userService: UserService, encryption: EncryptionService, tokenService: TokenService, emailService: EmailService, deviceService: DeviceService, inviteCodeService: InviteCodeService, redis: RedisService, config: ConfigService);
    register(dto: RegisterDto): Promise<{
        accessToken: string;
        refreshToken: string;
        secretKey: string;
        user: {
            id: any;
            username: any;
            email: any;
            phone: any;
            avatar: any;
            status: any;
            level: any;
            roles: string[];
            createdAt: any;
            updatedAt: any;
        };
    }>;
    login(dto: LoginDto, ip: string): Promise<{
        accessToken: string;
        refreshToken: string;
        secretKey: string;
        user: {
            id: any;
            username: any;
            email: any;
            phone: any;
            avatar: any;
            status: any;
            level: any;
            roles: string[];
            createdAt: any;
            updatedAt: any;
        };
    }>;
    refresh(refreshToken: string): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    logout(refreshToken: string): Promise<null>;
    forgotPassword(email: string): Promise<void>;
    resetPassword(token: string, newPassword: string): Promise<void>;
    validateUser(account: string, password: string): Promise<any>;
    private sanitizeUser;
    private generateAndStoreSecretKey;
    private parseRefreshTtl;
}
