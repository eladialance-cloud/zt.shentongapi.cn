import { Repository } from 'typeorm';
import { ClientVersionEntity, ClientPlatform } from '../entities/client-version.entity';
export interface CheckUpdateResult {
    hasUpdate: boolean;
    latestVersion: string | null;
    forceUpdate: boolean;
    grayscaleHit: boolean;
    downloadUrl: string | null;
    changelog: string | null;
}
export declare class VersionService {
    private versionRepo;
    constructor(versionRepo: Repository<ClientVersionEntity>);
    checkUpdate(platform: ClientPlatform, currentVersion: string): Promise<CheckUpdateResult>;
    getLatest(platform: ClientPlatform): Promise<ClientVersionEntity | null>;
    getStats(versionId: number): Promise<{
        versionId: number;
        installCount: number;
        activeCount: number;
    }>;
    list(platform?: string): Promise<ClientVersionEntity[]>;
    get(id: number): Promise<ClientVersionEntity>;
    create(data: Partial<ClientVersionEntity>): Promise<ClientVersionEntity>;
    update(id: number, data: Partial<ClientVersionEntity>): Promise<ClientVersionEntity>;
    delete(id: number): Promise<void>;
    health(): {
        status: string;
        module: string;
    };
    private compareVersion;
    private isGrayscaleHit;
}
