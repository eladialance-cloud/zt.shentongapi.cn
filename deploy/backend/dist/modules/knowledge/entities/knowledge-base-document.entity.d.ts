import { BaseEntity } from '../../../common/entities/base.entity';
export declare class KnowledgeBaseDocumentEntity extends BaseEntity {
    knowledgeBaseId: number;
    name: string;
    filePath: string;
    fileSize: number;
    mimeType?: string;
    chunkCount: number;
    tokenCount: number;
    status: 'pending' | 'processing' | 'done' | 'error';
    error?: string;
}
