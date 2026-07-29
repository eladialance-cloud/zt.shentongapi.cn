import { Repository } from 'typeorm';
import { PluginEntity } from '../entities/plugin.entity';
export declare class PluginService {
    private readonly pluginRepo;
    constructor(pluginRepo: Repository<PluginEntity>);
    list(page?: number, pageSize?: number, type?: string): Promise<{
        list: PluginEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    detail(id: number): Promise<PluginEntity>;
    health(): {
        status: string;
        module: string;
    };
}
