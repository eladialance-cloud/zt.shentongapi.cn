import { AdminSystemService } from './admin-system.service';
import { TenantQueryDto } from './dto/tenant-query.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
export declare class AdminTenantController {
    private readonly service;
    constructor(service: AdminSystemService);
    list(query: TenantQueryDto): Promise<{
        list: {
            id: number;
            name: string;
            quota: {
                users: number;
                calls: number;
                storage: number;
            };
            status: "active" | "suspended";
            createdAt: Date;
            updatedAt: Date;
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    create(dto: CreateTenantDto): Promise<{
        id: number;
        name: string;
        quota: {
            users: number;
            calls: number;
            storage: number;
        };
        status: "active" | "suspended";
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(id: number, dto: UpdateTenantDto): Promise<null>;
    suspend(id: number): Promise<null>;
}
