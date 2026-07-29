import { PluginService } from '../services/plugin.service';
import { ICurrentUser } from '../../../common/decorators/current-user.decorator';
export declare class PluginController {
    private readonly pluginService;
    constructor(pluginService: PluginService);
    health(): {
        status: string;
        module: string;
    };
    list(page?: string, pageSize?: string, type?: string): Promise<{
        list: import("../entities/plugin.entity").PluginEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    install(id: string, user: ICurrentUser): Promise<{
        success: boolean;
        message: string;
    }>;
    uninstall(id: string, user: ICurrentUser): Promise<{
        success: boolean;
        message: string;
    }>;
    enable(id: string, user: ICurrentUser): Promise<{
        success: boolean;
        message: string;
    }>;
    disable(id: string, user: ICurrentUser): Promise<{
        success: boolean;
        message: string;
    }>;
    logs(user: ICurrentUser, page?: string, pageSize?: string): Promise<{
        list: never[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    detail(id: string): Promise<import("../entities/plugin.entity").PluginEntity>;
}
