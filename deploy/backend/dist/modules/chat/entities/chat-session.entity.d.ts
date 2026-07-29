import { BaseEntity } from '../../../common/entities/base.entity';
export declare class ChatSessionEntity extends BaseEntity {
    title: string;
    modelId: string;
    agentId?: string;
    groupId: number;
    attachedKnowledgeBaseIds?: number[];
    enabledPluginIds?: number[];
    enabledWorkflowIds?: number[];
    userId: number;
}
