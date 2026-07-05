import { TenantService } from '../services/tenant.service';
export declare class TenantController {
    private readonly service;
    constructor(service: TenantService);
    health(): {
        status: string;
        module: string;
    };
}
