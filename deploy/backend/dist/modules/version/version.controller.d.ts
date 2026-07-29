import { VersionService } from './services/version.service';
import { ClientVersionEntity } from './entities/client-version.entity';
declare class CreateVersionDto {
    version: string;
    platform: 'win' | 'mac';
    downloadUrl: string;
    changelog?: string;
    forceUpdate?: boolean;
    grayscalePercent?: number;
    publishedAt?: Date;
    isActive?: boolean;
}
declare class UpdateVersionDto {
    version?: string;
    platform?: 'win' | 'mac';
    downloadUrl?: string;
    changelog?: string;
    forceUpdate?: boolean;
    grayscalePercent?: number;
    publishedAt?: Date;
    isActive?: boolean;
}
export declare class VersionController {
    private readonly service;
    constructor(service: VersionService);
    health(): {
        status: string;
        module: string;
    };
    check(platform: 'win' | 'mac', currentVersion: string): Promise<import("./services/version.service").CheckUpdateResult>;
    list(platform?: string): Promise<ClientVersionEntity[]>;
    latest(platform: 'win' | 'mac'): Promise<ClientVersionEntity | null>;
    create(dto: CreateVersionDto): Promise<ClientVersionEntity>;
    update(id: number, dto: UpdateVersionDto): Promise<ClientVersionEntity>;
    remove(id: number): Promise<null>;
    stats(id: number): Promise<{
        versionId: number;
        installCount: number;
        activeCount: number;
    }>;
}
export {};
