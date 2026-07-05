import { StorageService } from '../services/storage.service';
export declare class StorageController {
    private readonly service;
    constructor(service: StorageService);
    health(): {
        status: string;
        module: string;
    };
}
