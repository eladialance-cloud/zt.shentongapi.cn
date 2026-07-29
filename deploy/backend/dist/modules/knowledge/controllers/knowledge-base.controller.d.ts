import { KnowledgeBaseService } from '../services/knowledge-base.service';
import { ICurrentUser } from '../../../common/decorators/current-user.decorator';
export declare class KnowledgeBaseController {
    private readonly knowledgeBaseService;
    constructor(knowledgeBaseService: KnowledgeBaseService);
    health(): {
        status: string;
        module: string;
    };
    create(body: {
        name: string;
        description?: string;
        visibility?: 'private' | 'public';
    }, user: ICurrentUser): Promise<import("../entities/knowledge-base.entity").KnowledgeBaseEntity>;
    list(user: ICurrentUser, page?: number, pageSize?: number): Promise<{
        list: import("../entities/knowledge-base.entity").KnowledgeBaseEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    detail(id: number, user: ICurrentUser): Promise<import("../entities/knowledge-base.entity").KnowledgeBaseEntity>;
    update(id: number, body: Partial<{
        name: string;
        description?: string;
        visibility?: 'private' | 'public';
    }>, user: ICurrentUser): Promise<import("../entities/knowledge-base.entity").KnowledgeBaseEntity>;
    remove(id: number, user: ICurrentUser): Promise<null>;
    uploadDocument(id: number, user: ICurrentUser, file: Express.Multer.File): Promise<import("../entities/knowledge-base-document.entity").KnowledgeBaseDocumentEntity>;
    listDocuments(id: number, user: ICurrentUser, page?: number, pageSize?: number): Promise<{
        list: import("../entities/knowledge-base-document.entity").KnowledgeBaseDocumentEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    search(id: number, body: {
        query: string;
        topK?: number;
    }, user: ICurrentUser): Promise<never[]>;
    deleteDocument(id: number, docId: number, user: ICurrentUser): Promise<null>;
}
