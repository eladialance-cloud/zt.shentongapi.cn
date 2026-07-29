import { ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { SystemService } from '../services/system.service';
export declare class SystemController {
    private readonly service;
    constructor(service: SystemService);
    health(): {
        status: string;
        module: string;
    };
    getSystemStatus(user: ICurrentUser): {
        status: string;
        version: string;
        maintenance: boolean;
        features: {
            chat: boolean;
            payment: boolean;
            knowledgeBase: boolean;
            rag: boolean;
            mcp: boolean;
            n8n: boolean;
        };
    };
    getPublicConfig(): {
        siteName: string;
        siteDescription: string;
        supportEmail: string;
        maxUploadSize: number;
        allowedFileTypes: string[];
    };
    getFeatureFlags(user: ICurrentUser): {
        flags: {
            enableRag: boolean;
            enableMcp: boolean;
            enableN8n: boolean;
            enableOpc: boolean;
            enableTenant: boolean;
        };
    };
}
