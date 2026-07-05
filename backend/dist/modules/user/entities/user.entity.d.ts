import { BaseEntity } from '../../../common/entities/base.entity';
export declare class UserEntity extends BaseEntity {
    username: string;
    email: string;
    password: string;
    phone?: string;
    avatar?: string;
    status: 'active' | 'banned';
    realNameVerified: boolean;
    level: number;
    banReason?: string;
    banDuration?: 'permanent' | 'temporary';
    banUntil?: Date;
    registerSource: 'direct' | 'invite' | 'promotion';
    inviterId?: number;
    inviteCode?: string;
    needsTenantSetup: boolean;
}
