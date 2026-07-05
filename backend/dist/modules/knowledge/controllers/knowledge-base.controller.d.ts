import { KnowledgeBaseService } from '../services/knowledge-base.service';
export declare class KnowledgeBaseController {
    private readonly knowledgeBaseService;
    constructor(knowledgeBaseService: KnowledgeBaseService);
    health(): {
        status: string;
        module: string;
    };
}
