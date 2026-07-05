import { PluginService } from '../services/plugin.service';
export declare class PluginController {
    private readonly pluginService;
    constructor(pluginService: PluginService);
    health(): {
        status: string;
        module: string;
    };
}
