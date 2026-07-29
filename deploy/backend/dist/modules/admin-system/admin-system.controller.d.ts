import { AdminSystemService } from './admin-system.service';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { ClearCacheDto } from './dto/clear-cache.dto';
export declare class AdminSystemController {
    private readonly service;
    constructor(service: AdminSystemService);
    getConfig(section: string): Promise<Record<string, unknown>>;
    updateConfig(dto: UpdateSystemConfigDto): Promise<null>;
    clearCache(dto: ClearCacheDto): Promise<null>;
}
