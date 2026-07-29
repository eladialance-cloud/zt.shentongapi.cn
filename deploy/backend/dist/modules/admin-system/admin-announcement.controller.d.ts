import { AdminSystemService } from './admin-system.service';
import { AnnouncementQueryDto } from './dto/announcement-query.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
export declare class AdminAnnouncementController {
    private readonly service;
    constructor(service: AdminSystemService);
    list(query: AnnouncementQueryDto): Promise<{
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
    create(dto: CreateAnnouncementDto): Promise<{
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
    update(id: number, dto: UpdateAnnouncementDto): Promise<null>;
    publish(id: number): Promise<null>;
    unpublish(id: number): Promise<null>;
    remove(id: number): Promise<null>;
}
