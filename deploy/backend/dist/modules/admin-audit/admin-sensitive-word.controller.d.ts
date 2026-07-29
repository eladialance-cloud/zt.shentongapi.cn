import { AdminAuditService } from './admin-audit.service';
import { SensitiveWordQueryDto } from './dto/sensitive-word-query.dto';
import { CreateSensitiveWordDto } from './dto/create-sensitive-word.dto';
import { BatchCreateSensitiveWordDto } from './dto/batch-create-sensitive-word.dto';
export declare class AdminSensitiveWordController {
    private readonly service;
    constructor(service: AdminAuditService);
    list(query: SensitiveWordQueryDto): Promise<{
        list: {
            id: number;
            word: string;
            category: "other" | "politics" | "porn" | "violence" | "ad";
            level: "replace" | "review" | "block";
            replacement: string | undefined;
            createdAt: Date;
            updatedAt: Date;
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    create(dto: CreateSensitiveWordDto): Promise<{
        id: number;
        word: string;
        category: "other" | "politics" | "porn" | "violence" | "ad";
        level: "replace" | "review" | "block";
        replacement: string | undefined;
        createdAt: Date;
        updatedAt: Date;
    }>;
    batchCreate(dto: BatchCreateSensitiveWordDto): Promise<{
        created: number;
    }>;
    remove(id: number): Promise<null>;
}
