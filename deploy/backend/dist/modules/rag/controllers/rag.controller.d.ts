import { ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { RagService } from '../services/rag.service';
export declare class RagController {
    private readonly service;
    constructor(service: RagService);
    health(): {
        status: string;
        module: string;
    };
    retrieve(user: ICurrentUser, body: {
        knowledgeBaseId: number;
        query: string;
        topK?: number;
    }): Promise<import("../services/rag.service").RetrieveResult>;
    augment(user: ICurrentUser, body: {
        query: string;
        retrievedDocs: any[];
    }): Promise<import("../services/rag.service").AugmentResult>;
    index(user: ICurrentUser, body: {
        knowledgeBaseId: number;
        documentId: number;
        content: string;
        chunkSize?: number;
        overlap?: number;
    }): Promise<import("../services/rag.service").IndexResult>;
    reindex(user: ICurrentUser, knowledgeBaseId: number): Promise<import("../services/rag.service").ReindexResult>;
}
