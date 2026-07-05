import { Repository } from 'typeorm';
import { InviteCodeEntity } from './entities/invite-code.entity';
export declare class InviteCodeService {
    private inviteCodeRepo;
    private static readonly CHARSET;
    private static readonly CODE_LENGTH;
    private static readonly EXPIRE_DAYS;
    constructor(inviteCodeRepo: Repository<InviteCodeEntity>);
    generateCode(inviterId: number): Promise<InviteCodeEntity>;
    validateCode(code: string): Promise<InviteCodeEntity | null>;
    consumeCode(code: string, inviteeId: number): Promise<void>;
    listMyCodes(inviterId: number): Promise<InviteCodeEntity[]>;
    getInviteStats(inviterId: number): Promise<{
        total: number;
        used: number;
        active: number;
    }>;
    private generateRandomCode;
    private generateCodeString;
}
