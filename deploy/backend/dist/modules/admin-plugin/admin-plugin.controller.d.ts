import { AdminPluginService } from './admin-plugin.service';
import { AdminPluginQueryDto, AdminPluginReviewQueryDto, CreateAdminPluginDto, PluginSyncQueryDto, UpdateAdminPluginDto } from './dto/plugin.dto';
import { PluginRejectDto, PluginReviewDto } from './dto/review.dto';
export declare class AdminPluginController {
    private readonly service;
    constructor(service: AdminPluginService);
    list(query: AdminPluginQueryDto): Promise<{
        list: {
            id: number;
            name: string;
            description: string;
            type: string;
            version: string;
            entryPoint: string | undefined;
            status: string;
            reviewStatus: "approved" | "rejected" | "pending";
            creatorName: undefined;
            isOfficial: boolean;
            pricingMode: string;
            pricePerCall: number;
            pricePerTokenInput: number;
            pricePerTokenOutput: number;
            callCount: number;
            rejectReason: string | undefined;
            createdAt: Date;
            updatedAt: Date;
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    create(dto: CreateAdminPluginDto): Promise<{
        id: number;
        name: string;
        description: string;
        type: string;
        version: string;
        entryPoint: string | undefined;
        status: string;
        reviewStatus: "approved" | "rejected" | "pending";
        creatorName: undefined;
        isOfficial: boolean;
        pricingMode: string;
        pricePerCall: number;
        pricePerTokenInput: number;
        pricePerTokenOutput: number;
        callCount: number;
        rejectReason: string | undefined;
        createdAt: Date;
        updatedAt: Date;
    }>;
    listReview(query: AdminPluginReviewQueryDto): Promise<{
        list: {
            id: number;
            name: string;
            description: string;
            type: string;
            version: string;
            entryPoint: string | undefined;
            status: string;
            reviewStatus: "approved" | "rejected" | "pending";
            creatorName: undefined;
            isOfficial: boolean;
            pricingMode: string;
            pricePerCall: number;
            pricePerTokenInput: number;
            pricePerTokenOutput: number;
            callCount: number;
            rejectReason: string | undefined;
            createdAt: Date;
            updatedAt: Date;
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    listSyncStatus(query: PluginSyncQueryDto): Promise<{
        list: {
            id: number;
            name: string;
            type: string;
            syncStatus: string;
            lastSyncedAt: Date;
            errorMessage: undefined;
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    syncAll(): Promise<{
        synced: boolean;
        count: number;
    }>;
    detail(id: number): Promise<{
        id: number;
        name: string;
        description: string;
        type: string;
        version: string;
        entryPoint: string | undefined;
        status: string;
        reviewStatus: "approved" | "rejected" | "pending";
        creatorName: undefined;
        isOfficial: boolean;
        pricingMode: string;
        pricePerCall: number;
        pricePerTokenInput: number;
        pricePerTokenOutput: number;
        callCount: number;
        rejectReason: string | undefined;
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(id: number, dto: UpdateAdminPluginDto): Promise<null>;
    remove(id: number): Promise<null>;
    publish(id: number): Promise<null>;
    unpublish(id: number): Promise<null>;
    review(id: number, dto: PluginReviewDto): Promise<null>;
    approve(id: number): Promise<null>;
    reject(id: number, dto: PluginRejectDto): Promise<null>;
    sync(id: number): Promise<{
        synced: boolean;
        count: number;
    }>;
}
