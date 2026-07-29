import { BaseEntity } from '../../../common/entities/base.entity';
export declare class SkillInstallLogEntity extends BaseEntity {
    packageId: number;
    userId?: number;
    action: 'install' | 'analyze' | 'execute' | 'health_check';
    result: 'success' | 'failed' | 'timeout';
    errorMessage?: string;
    durationMs: number;
    detail?: Record<string, unknown>;
}
