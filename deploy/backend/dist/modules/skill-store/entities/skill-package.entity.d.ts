import { BaseEntity } from '../../../common/entities/base.entity';
export declare class SkillPackageEntity extends BaseEntity {
    name: string;
    displayName: string;
    description: string;
    skillType: 'skill' | 'workflow';
    runtimeType: string;
    category?: string;
    sourceUrl: string;
    installPath?: string;
    skillMdPath?: string;
    entryPoint?: string;
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    dependencies?: Record<string, unknown>;
    triggerKeywords?: string[];
    examples?: Record<string, unknown>[];
    uiConfig?: Record<string, unknown>;
    opcAgentConfig?: Record<string, unknown>;
    status: 'draft' | 'reviewing' | 'approved' | 'published' | 'unpublished' | 'failed';
    reviewStatus: 'pending' | 'approved' | 'rejected';
    reviewNote?: string;
    isOfficial: boolean;
    callCount: number;
    avgRating: number;
    version: string;
}
