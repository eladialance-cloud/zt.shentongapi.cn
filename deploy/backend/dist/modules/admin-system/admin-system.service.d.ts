import { Repository } from 'typeorm';
import { SystemConfigEntity } from './entities/system-config.entity';
import { AnnouncementEntity } from './entities/announcement.entity';
import { TenantEntity } from './entities/tenant.entity';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { ClearCacheDto } from './dto/clear-cache.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { AnnouncementQueryDto } from './dto/announcement-query.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantQueryDto } from './dto/tenant-query.dto';
export declare class AdminSystemService {
    private readonly configRepo;
    private readonly announcementRepo;
    private readonly tenantRepo;
    constructor(configRepo: Repository<SystemConfigEntity>, announcementRepo: Repository<AnnouncementEntity>, tenantRepo: Repository<TenantEntity>);
    getSystemConfig(section: string): Promise<Record<string, unknown>>;
    updateSystemConfig(dto: UpdateSystemConfigDto): Promise<void>;
    clearCache(dto: ClearCacheDto): Promise<void>;
    listTenants(query: TenantQueryDto): Promise<{
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
    createTenant(dto: CreateTenantDto): Promise<{
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
    updateTenant(id: number, dto: UpdateTenantDto): Promise<void>;
    suspendTenant(id: number): Promise<void>;
    listAnnouncements(query: AnnouncementQueryDto): Promise<{
        list: {
            id: number;
            title: string;
            content: string;
            type: "info" | "warning" | "critical";
            scope: "all" | "level_specific";
            targetLevel: number | undefined;
            isActive: boolean;
            status: "draft" | "published";
            publishedAt: Date | undefined;
            createdAt: Date;
            updatedAt: Date;
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    createAnnouncement(dto: CreateAnnouncementDto): Promise<{
        id: number;
        title: string;
        content: string;
        type: "info" | "warning" | "critical";
        scope: "all" | "level_specific";
        targetLevel: number | undefined;
        isActive: boolean;
        status: "draft" | "published";
        publishedAt: Date | undefined;
        createdAt: Date;
        updatedAt: Date;
    }>;
    updateAnnouncement(id: number, dto: UpdateAnnouncementDto): Promise<void>;
    publishAnnouncement(id: number): Promise<void>;
    unpublishAnnouncement(id: number): Promise<void>;
    deleteAnnouncement(id: number): Promise<void>;
    private toTenant;
    private toAnnouncement;
}
