import { BaseEntity } from '../../../common/entities/base.entity';
export declare class TenantEntity extends BaseEntity {
    name: string;
    quota: {
        users: number;
        calls: number;
        storage: number;
    };
    status: 'active' | 'suspended';
}
