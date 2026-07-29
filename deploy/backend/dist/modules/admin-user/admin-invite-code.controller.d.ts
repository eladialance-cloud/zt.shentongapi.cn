import { InviteCodeService } from '../user/invite-code.service';
import { GenerateInviteCodesDto } from './dto/generate-invite-codes.dto';
import { InviteCodeQueryDto } from './dto/invite-code-query.dto';
export declare class AdminInviteCodeController {
    private readonly inviteCodeService;
    constructor(inviteCodeService: InviteCodeService);
    generate(dto: GenerateInviteCodesDto, req: any): Promise<{
        codes: {
            id: number;
            code: string;
            expiresAt: Date;
        }[];
        count: number;
    }>;
    list(query: InviteCodeQueryDto): Promise<{
        list: import("../user/entities/invite-code.entity").InviteCodeEntity[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    revoke(id: number): Promise<{
        success: boolean;
    }>;
}
