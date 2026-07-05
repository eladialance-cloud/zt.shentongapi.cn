import { BaseEntity } from '../../../common/entities/base.entity';
export declare class PluginEntity extends BaseEntity {
    name: string;
    description?: string;
    version: string;
    mcpServerUrl?: string;
    config?: Record<string, unknown>;
    isOfficial: boolean;
    isActive: boolean;
}
