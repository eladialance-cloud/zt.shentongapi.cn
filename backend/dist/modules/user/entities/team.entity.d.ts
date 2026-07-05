import { BaseEntity } from '../../../common/entities/base.entity';
export declare class TeamEntity extends BaseEntity {
    name: string;
    ownerId: number;
    description?: string;
}
