export declare class SystemService {
    health(): {
        status: string;
        module: string;
    };
    getSystemStatus(userId: number): {
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
    getFeatureFlags(userId: number): {
        flags: {
            enableRag: boolean;
            enableMcp: boolean;
            enableN8n: boolean;
            enableOpc: boolean;
            enableTenant: boolean;
        };
    };
}
