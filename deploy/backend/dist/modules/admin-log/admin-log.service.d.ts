import { Repository } from 'typeorm';
import { OperationLogEntity } from './operation-log.entity';
import { OperationLogQueryDto } from './dto/operation-log-query.dto';
export declare class AdminLogService {
    private repo;
    constructor(repo: Repository<OperationLogEntity>);
    list(query: OperationLogQueryDto): Promise<{
        list: OperationLogEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    record(data: Partial<OperationLogEntity>): Promise<void>;
}
