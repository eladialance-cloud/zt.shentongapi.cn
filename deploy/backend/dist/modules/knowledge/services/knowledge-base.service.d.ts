import { Repository } from 'typeorm';
import { KnowledgeBaseEntity } from '../entities/knowledge-base.entity';
import { KnowledgeBaseDocumentEntity } from '../entities/knowledge-base-document.entity';
export declare class KnowledgeBaseService {
    private readonly kbRepo;
    private readonly docRepo;
    constructor(kbRepo: Repository<KnowledgeBaseEntity>, docRepo: Repository<KnowledgeBaseDocumentEntity>);
    health(): {
        status: string;
        module: string;
    };
    create(userId: number, data: {
        name: string;
        description?: string;
        visibility?: 'private' | 'public';
    }): Promise<KnowledgeBaseEntity>;
    list(userId: number, page?: number, pageSize?: number): Promise<{
        list: KnowledgeBaseEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    detail(id: number, userId: number): Promise<KnowledgeBaseEntity>;
    update(id: number, userId: number, data: Partial<KnowledgeBaseEntity>): Promise<KnowledgeBaseEntity>;
    remove(id: number, userId: number): Promise<void>;
    uploadDocument(kbId: number, userId: number, file: Express.Multer.File): Promise<KnowledgeBaseDocumentEntity>;
    listDocuments(kbId: number, userId: number, page?: number, pageSize?: number): Promise<{
        list: KnowledgeBaseDocumentEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    deleteDocument(kbId: number, docId: number, userId: number): Promise<void>;
}
