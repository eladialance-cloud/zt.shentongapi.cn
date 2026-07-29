import { CreditsService } from '../services/credits.service';
import { ICurrentUser } from '../../../common/decorators/current-user.decorator';
declare class AdminAdjustDto {
    userId: number;
    amount: number;
    remark?: string;
}
export declare class CreditsController {
    private readonly creditsService;
    constructor(creditsService: CreditsService);
    health(): {
        status: string;
        module: string;
    };
    getAccount(user: ICurrentUser): Promise<import("../entities/credit-account.entity").CreditAccountEntity>;
    getTransactions(user: ICurrentUser, page?: string, pageSize?: string, type?: string, source?: string, startDate?: string, endDate?: string, keyword?: string): Promise<import("../../../common/types/pagination.type").PaginatedResult<import("../entities/credit-transaction.entity").CreditTransactionEntity>>;
}
export declare class AdminCreditsController {
    private readonly creditsService;
    constructor(creditsService: CreditsService);
    adjust(dto: AdminAdjustDto, user: ICurrentUser): Promise<import("../entities/credit-transaction.entity").CreditTransactionEntity>;
}
export {};
