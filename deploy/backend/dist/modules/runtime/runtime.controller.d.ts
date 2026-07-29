import { RuntimeService, RuntimeCheckUpdateResult } from './services/runtime.service';
export declare class RuntimeController {
    private readonly service;
    constructor(service: RuntimeService);
    checkUpdate(platform: string): Promise<RuntimeCheckUpdateResult>;
}
