import { BaseEntity } from '../../../common/entities/base.entity';
export declare class RoleEntity extends BaseEntity {
    name: string;
    description?: string;
    permissions?: string[] | Record<string, unknown>;
}
