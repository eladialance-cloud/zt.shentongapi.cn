import { Repository } from 'typeorm';
import { SkillPackageEntity } from '../entities/skill-package.entity';
export interface SkillPackageListQuery {
    page?: number;
    pageSize?: number;
    category?: string;
    skillType?: string;
    keyword?: string;
}
export declare class SkillStoreService {
    private packageRepo;
    constructor(packageRepo: Repository<SkillPackageEntity>);
    list(query: SkillPackageListQuery): Promise<{
        list: {
            name: string;
            displayName: string;
            description: string;
            skillType: "skill" | "workflow";
            runtimeType: string;
            category?: string;
            sourceUrl: string;
            entryPoint?: string;
            inputSchema?: Record<string, unknown>;
            outputSchema?: Record<string, unknown>;
            dependencies?: Record<string, unknown>;
            triggerKeywords?: string[];
            examples?: Record<string, unknown>[];
            uiConfig?: Record<string, unknown>;
            opcAgentConfig?: Record<string, unknown>;
            status: "draft" | "reviewing" | "approved" | "published" | "unpublished" | "failed";
            reviewStatus: "pending" | "approved" | "rejected";
            reviewNote?: string;
            isOfficial: boolean;
            callCount: number;
            avgRating: number;
            version: string;
            id: number;
            createdAt: Date;
            updatedAt: Date;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    detail(id: number): Promise<{
        name: string;
        displayName: string;
        description: string;
        skillType: "skill" | "workflow";
        runtimeType: string;
        category?: string;
        sourceUrl: string;
        entryPoint?: string;
        inputSchema?: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
        dependencies?: Record<string, unknown>;
        triggerKeywords?: string[];
        examples?: Record<string, unknown>[];
        uiConfig?: Record<string, unknown>;
        opcAgentConfig?: Record<string, unknown>;
        status: "draft" | "reviewing" | "approved" | "published" | "unpublished" | "failed";
        reviewStatus: "pending" | "approved" | "rejected";
        reviewNote?: string;
        isOfficial: boolean;
        callCount: number;
        avgRating: number;
        version: string;
        id: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    categories(): Promise<{
        category: any;
        count: number;
    }[]>;
    stats(id: number): Promise<{
        callCount: number;
        avgRating: number;
        version: string;
        updatedAt: Date;
    }>;
    private toSafePackage;
}
