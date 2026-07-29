import { AdminRoleService } from './admin-role.service';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
export declare class AdminRoleController {
    private readonly service;
    constructor(service: AdminRoleService);
    list(): Promise<{
        id: number;
        name: string;
        code: string;
        permissionCodes: string[];
        userCount: number;
        description: string | undefined;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    updatePermissions(id: number, dto: UpdatePermissionsDto): Promise<{
        id: number;
        name: string;
        code: string;
        permissionCodes: string[];
        userCount: number;
        description: string | undefined;
        createdAt: Date;
        updatedAt: Date;
    } | null>;
}
