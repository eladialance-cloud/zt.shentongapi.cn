import { Repository, DataSource } from 'typeorm';
import { RedisService } from '../../../common/services/redis.service';
import { KnowledgeBaseEntity } from '../../knowledge/entities/knowledge-base.entity';
import { KnowledgeBaseDocumentEntity } from '../../knowledge/entities/knowledge-base-document.entity';
import { KnowledgeBaseChunkEntity } from '../../knowledge/entities/knowledge-base-chunk.entity';
interface RetrieveQuery {
    knowledgeBaseId: number;
    query: string;
    topK?: number;
}
export interface RetrieveResult {
    query: string;
    matches: ChunkMatchResult[];
    message: string;
    cached: boolean;
}
export interface ChunkMatchResult {
    chunkId: number;
    documentId: number;
    documentName: string;
    content: string;
    chunkIndex: number;
    score: number;
}
export interface AugmentResult {
    augmentedPrompt: string;
    contextCount: number;
}
interface IndexDocumentData {
    knowledgeBaseId: number;
    documentId: number;
    content: string;
    chunkSize?: number;
    overlap?: number;
}
export interface IndexResult {
    documentId: number;
    knowledgeBaseId: number;
    chunkCount: number;
    totalTokens: number;
}
export interface ReindexResult {
    knowledgeBaseId: number;
    documentCount: number;
    totalChunks: number;
    totalTokens: number;
}
export declare class RagService {
    private readonly kbRepo;
    private readonly docRepo;
    private readonly chunkRepo;
    private readonly redis;
    private readonly dataSource;
    private readonly logger;
    constructor(kbRepo: Repository<KnowledgeBaseEntity>, docRepo: Repository<KnowledgeBaseDocumentEntity>, chunkRepo: Repository<KnowledgeBaseChunkEntity>, redis: RedisService, dataSource: DataSource);
    health(): {
        status: string;
        module: string;
    };
    retrieve(userId: number, query: RetrieveQuery): Promise<RetrieveResult>;
    augmentPrompt(userId: number, data: {
        query: string;
        retrievedDocs: ChunkMatchResult[];
    }): Promise<AugmentResult>;
    indexDocument(userId: number, data: IndexDocumentData): Promise<IndexResult>;
    reindexKnowledgeBase(userId: number, knowledgeBaseId: number): Promise<ReindexResult>;
    private searchChunks;
    private fulltextSearch;
    private likeSearch;
    private extractKeywords;
    private splitTextIntoChunks;
    private estimateTokenCount;
    private updateKnowledgeBaseStats;
    private readDocumentContent;
    private buildCacheKey;
    private clearRetrieveCache;
}
export {};
