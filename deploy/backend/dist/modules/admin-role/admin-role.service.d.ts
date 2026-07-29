import { Repository } from 'typeorm';
import { RoleEntity } from '../user/entities/role.entity';
import { UserRoleEntity } from '../user/entities/user-role.entity';
export declare class AdminRoleService {
    private roleRepo;
    private userRoleRepo;
    constructor(roleRepo: Repository<RoleEntity>, userRoleRepo: Repository<UserRoleEntity>);
    listRoles(): Promise<{
        id: number;
        name: string;
        code: string;
        permissionCodes: string[];
        userCount: number;
        description: string | undefined;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    updatePermissions(id: number, permissionCodes: string[]): Promise<{
        id: number;
        name: string;
        code: string;
        permissionCodes: string[];
        userCount: number;
        description: string | undefined;
        createdAt: Date;
        updatedAt: Date;
    } | null>;
    private toAdminRole;
}
