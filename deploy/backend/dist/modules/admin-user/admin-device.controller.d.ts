import { AdminUserService } from './admin-user.service';
import { DeviceQueryDto } from './dto/device-query.dto';
export declare class AdminDeviceController {
    private readonly service;
    constructor(service: AdminUserService);
    list(query: DeviceQueryDto): Promise<{
        list: {
            id: number;
            userId: number;
            username: string;
            deviceName: string;
            deviceFingerprint: string;
            lastLoginAt: string;
            createdAt: string;
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    delete(id: number): Promise<void>;
}
