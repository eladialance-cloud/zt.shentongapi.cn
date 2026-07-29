import { ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { SkillStoreService, SkillPackageListQuery } from '../services/skill-store.service';
import { SkillRunnerService } from '../services/skill-runner.service';
import { ExecuteSkillDto } from '../dto/execute.dto';
export declare class SkillStoreController {
    private readonly storeService;
    private readonly runnerService;
    constructor(storeService: SkillStoreService, runnerService: SkillRunnerService);
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
    categories(): Promise<{
        category: any;
        count: number;
    }[]>;
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
    stats(id: number): Promise<{
        callCount: number;
        avgRating: number;
        version: string;
        updatedAt: Date;
    }>;
    execute(id: number, dto: ExecuteSkillDto, user: ICurrentUser): Promise<unknown>;
    health(): {
        status: string;
        module: string;
    };
}
