import { Repository } from 'typeorm';
import { ModelEntity } from '../model/entities/model.entity';
import { CreateModelDto } from './dto/create-model.dto';
import { UpdateModelDto } from './dto/update-model.dto';
import { TestModelDto } from './dto/test-model.dto';
import { EncryptionService } from '../../common/services/encryption.service';
interface ModelQuery {
    provider?: string;
    enabled?: boolean | string;
    page?: number;
    pageSize?: number;
}
export declare class AdminModelService {
    private modelRepo;
    private encryptionService;
    constructor(modelRepo: Repository<ModelEntity>, encryptionService: EncryptionService);
    list(query: ModelQuery): Promise<{
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
    test(id: number, _dto: TestModelDto): Promise<{
        success: boolean;
        response: string;
    }>;
    sync(id: number): Promise<void>;
    providers(): {
        value: string;
        label: string;
    }[];
    private applyCreateDto;
    private applyUpdateDto;
    private toAdminModelItem;
}
export {};
