import { AdminLogService } from './admin-log.service';
import { OperationLogQueryDto } from './dto/operation-log-query.dto';
export declare class AdminLogController {
    private readonly service;
    constructor(service: AdminLogService);
    list(query: OperationLogQueryDto): Promise<{
        list: import("./operation-log.entity").OperationLogEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
}
