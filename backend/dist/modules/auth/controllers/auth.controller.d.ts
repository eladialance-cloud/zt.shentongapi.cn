import type { Request } from 'express';
import { AuthService } from '../services/auth.service';
import { TokenService } from '../services/token.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { UserService } from '../../user/services/user.service';
export declare class AuthController {
    private authService;
    private tokenService;
    private userService;
    constructor(authService: AuthService, tokenService: TokenService, userService: UserService);
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
    login(dto: LoginDto, req: Request): Promise<{
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
    refresh(dto: RefreshTokenDto): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    logout(body: {
        refreshToken?: string;
    }): Promise<null>;
    forgotPassword(dto: ForgotPasswordDto): Promise<{
        message: string;
    }>;
    resetPassword(dto: ResetPasswordDto): Promise<{
        message: string;
    }>;
    profile(user: ICurrentUser): Promise<{
        id: number;
        username: string;
        email: string;
        phone: string | undefined;
        avatar: string | undefined;
        status: "active" | "banned";
        level: number;
        roles: string[];
        createdAt: Date;
        updatedAt: Date;
    }>;
    me(user: ICurrentUser): Promise<{
        id: number;
        username: string;
        email: string;
        phone: string | undefined;
        avatar: string | undefined;
        status: "active" | "banned";
        level: number;
        roles: string[];
        createdAt: Date;
        updatedAt: Date;
    }>;
}
