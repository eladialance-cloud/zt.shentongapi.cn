export declare class UpdateSkillPackageDto {
    displayName?: string;
    description?: string;
    category?: string;
    triggerKeywords?: string[];
    examples?: Record<string, unknown>[];
    uiConfig?: {
        icon?: string;
        color?: string;
        [key: string]: unknown;
    };
    opcAgentConfig?: Record<string, unknown>;
}
export declare class SkillPackageQueryDto {
    page?: number;
    pageSize?: number;
    status?: string;
    skillType?: string;
    category?: string;
    reviewStatus?: string;
}
export declare class RejectSkillPackageDto {
    reason: string;
}
