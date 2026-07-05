import { RagService } from '../services/rag.service';
export declare class RagController {
    private readonly service;
    constructor(service: RagService);
    health(): {
        status: string;
        module: string;
    };
}
