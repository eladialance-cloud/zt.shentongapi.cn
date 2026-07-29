import { BaseEntity } from '../../../common/entities/base.entity';
export declare class SkillSourceEntity extends BaseEntity {
    sourceUrl: string;
    sourceType: 'github' | 'npm' | 'zip' | 'url';
    skillName: string;
    skillDesc: string;
    skillType: 'skill' | 'workflow';
    autoDetectedType?: string;
    status: 'pending' | 'analyzing' | 'analyzed' | 'failed';
    analyzeResult?: Record<string, unknown>;
    errorMessage?: string;
    packageId?: number;
}
