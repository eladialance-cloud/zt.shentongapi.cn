import { AdminUserService } from './admin-user.service';
import { UserLevelConfigDto } from './dto/user-level-config.dto';
export declare class AdminUserLevelController {
    private readonly service;
    constructor(service: AdminUserService);
    list(): Promise<any[]>;
    update(level: number, dto: UserLevelConfigDto): Promise<void>;
}
