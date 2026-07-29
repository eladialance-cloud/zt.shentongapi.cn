import { Repository } from 'typeorm';
import { RuntimeVersionEntity } from '../entities/runtime-version.entity';
export interface RuntimeVersionInfo {
    version: string;
    downloadUrl: string;
    sha256: string;
    changelog: string | null;
    forceUpdate: boolean;
    minAppVersion: string | null;
}
export type RuntimeCheckUpdateResult = {
    openclaw: RuntimeVersionInfo | null;
    n8n: RuntimeVersionInfo | null;
    mcp: RuntimeVersionInfo | null;
};
export declare class RuntimeService {
    private runtimeRepo;
    private readonly logger;
    constructor(runtimeRepo: Repository<RuntimeVersionEntity>);
    checkUpdate(platform: string): Promise<RuntimeCheckUpdateResult>;
    health(): {
        status: string;
        module: string;
    };
}
