import { BaseEntity } from '../../../common/entities/base.entity';
export declare class RoleEntity extends BaseEntity {
    name: string;
    code?: string;
    description?: string;
    permissions?: string[] | Record<string, unknown>;
}
