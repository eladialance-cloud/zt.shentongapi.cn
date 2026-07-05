import { N8nService } from '../services/n8n.service';
export declare class N8nController {
    private readonly service;
    constructor(service: N8nService);
    health(): {
        status: string;
        module: string;
    };
}
