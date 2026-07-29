export declare class CreateN8nInstanceDto {
    name: string;
    description?: string;
    baseUrl: string;
    apiKey: string;
    webhookUrl?: string;
    config?: Record<string, unknown>;
}
export declare class UpdateN8nInstanceDto {
    name?: string;
    description?: string;
    baseUrl?: string;
    apiKey?: string;
    status?: string;
    webhookUrl?: string;
    config?: Record<string, unknown>;
}
