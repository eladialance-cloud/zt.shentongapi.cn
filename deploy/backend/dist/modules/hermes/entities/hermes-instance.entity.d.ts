import { BaseEntity } from '../../../common/entities/base.entity';
export declare class HermesInstanceEntity extends BaseEntity {
    userId: number;
    name: string;
    status: 'running' | 'stopped' | 'error';
    pid?: number;
    skillCount: number;
    skillIds?: number[];
    errorMessage?: string;
    cpuPercent: number;
    memoryUsedMb: number;
    memoryTotalMb: number;
    startedAt?: Date;
}
