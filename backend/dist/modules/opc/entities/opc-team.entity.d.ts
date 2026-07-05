import { BaseEntity } from '../../../common/entities/base.entity';
export declare class OpcTeamEntity extends BaseEntity {
    name: string;
    avatar?: string;
    description?: string;
    memberCount: number;
    creatorId: number;
}
