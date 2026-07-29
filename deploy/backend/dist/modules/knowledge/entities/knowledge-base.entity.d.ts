import { BaseEntity } from '../../../common/entities/base.entity';
export declare class KnowledgeBaseEntity extends BaseEntity {
    userId: number;
    name: string;
    description?: string;
    visibility: 'private' | 'public';
    status: 'active' | 'processing' | 'reindexing' | 'error' | 'deleting' | 'delete_failed';
    embeddingModel: string;
    chunkSize: number;
    chunkOverlap: number;
    documentCount: number;
    totalChunks: number;
    totalTokens: number;
}
