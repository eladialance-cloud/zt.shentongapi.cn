import { OpcService } from '../services/opc.service';
export declare class OpcController {
    private readonly service;
    constructor(service: OpcService);
    health(): {
        status: string;
        module: string;
    };
}
