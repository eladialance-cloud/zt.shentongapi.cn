import { AdminModelService } from './admin-model.service';
import { CreateModelDto } from './dto/create-model.dto';
import { UpdateModelDto } from './dto/update-model.dto';
import { TestModelDto } from './dto/test-model.dto';
export declare class AdminModelController {
    private readonly service;
    constructor(service: AdminModelService);
    list(query: Record<string, unknown>): Promise<{
        list: {
            id: number;
            provider: string;
            modelId: string;
            displayName: string;
            apiKeyMasked: undefined;
            apiEndpoint: undefined;
            inputPricePerToken: number;
            outputPricePerToken: number;
            minUserLevel: number;
            enabled: boolean;
            syncStatus: "synced";
            syncErrorMessage: undefined;
            capabilities: string[];
            concurrencyLimit: undefined;
            rateLimitPerMinute: undefined;
            lastSyncedAt: undefined;
            createdAt: Date;
            updatedAt: Date;
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    providers(): {
        value: string;
        label: string;
    }[];
    detail(id: number): Promise<{
        id: number;
        provider: string;
        modelId: string;
        displayName: string;
        apiKeyMasked: undefined;
        apiEndpoint: undefined;
        inputPricePerToken: number;
        outputPricePerToken: number;
        minUserLevel: number;
        enabled: boolean;
        syncStatus: "synced";
        syncErrorMessage: undefined;
        capabilities: string[];
        concurrencyLimit: undefined;
        rateLimitPerMinute: undefined;
        lastSyncedAt: undefined;
        createdAt: Date;
        updatedAt: Date;
    }>;
    create(dto: CreateModelDto): Promise<{
        id: number;
        provider: string;
        modelId: string;
        displayName: string;
        apiKeyMasked: undefined;
        apiEndpoint: undefined;
        inputPricePerToken: number;
        outputPricePerToken: number;
        minUserLevel: number;
        enabled: boolean;
        syncStatus: "synced";
        syncErrorMessage: undefined;
        capabilities: string[];
        concurrencyLimit: undefined;
        rateLimitPerMinute: undefined;
        lastSyncedAt: undefined;
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(id: number, dto: UpdateModelDto): Promise<void>;
    remove(id: number): Promise<void>;
    enable(id: number): Promise<void>;
    disable(id: number): Promise<void>;
    test(id: number, dto: TestModelDto): Promise<{
        success: boolean;
        response: string;
    }>;
    sync(id: number): Promise<void>;
}
