import { SystemService } from '../services/system.service';
export declare class SystemController {
    private readonly service;
    constructor(service: SystemService);
    health(): {
        status: string;
        module: string;
    };
}
