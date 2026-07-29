import { AdminUserService } from './admin-user.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { BanUserDto } from './dto/ban-user.dto';
import { CreditsAdjustDto } from './dto/credits-adjust.dto';
import { UpdateUserLevelDto } from './dto/update-user-level.dto';
export declare class AdminUserController {
    private readonly service;
    constructor(service: AdminUserService);
    list(query: UserQueryDto): Promise<{
        list: {
            id: number;
            username: string;
            email: string;
            phone: string | undefined;
            avatar: string | undefined;
            level: number;
            status: "active" | "banned" | "deleted";
            creditsBalance: number;
            createdAt: string;
            updatedAt: string;
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    create(dto: CreateAdminUserDto): Promise<{
        id: number;
        username: string;
        email: string;
        level: number;
        status: "active" | "banned" | "deleted";
        createdAt: Date;
    }>;
    delete(id: number): Promise<void>;
    ban(id: number, dto: BanUserDto): Promise<void>;
    unban(id: number): Promise<void>;
    updateLevel(id: number, dto: UpdateUserLevelDto): Promise<void>;
    creditsAccount(id: number): Promise<{
        userId: number;
        username: string;
        balance: number;
        frozenBalance: number;
        totalRecharged: number;
        totalConsumed: number;
        version: number;
        updatedAt: string;
    }>;
    creditsAdjust(id: number, dto: CreditsAdjustDto, req: any): Promise<void>;
    creditsTransactions(id: number, limit?: string): Promise<{
        id: number;
        type: import("../credits/entities/credit-transaction.entity").CreditTxnType;
        amount: number;
        balanceBefore: number;
        balanceAfter: number;
        source: import("../credits/entities/credit-transaction.entity").CreditTxnSource;
        remark: string;
        createdAt: string;
    }[]>;
}
