import { ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { OpenClawService } from '../services/openclaw.service';
import { RegisterInstanceDto, UpdateConfigDto } from '../dto/openclaw.dto';
export declare class OpenClawController {
    private readonly service;
    constructor(service: OpenClawService);
    health(): Promise<{
        status: string;
        endpoint: string;
    }>;
    listInstances(user: ICurrentUser): Promise<import("../entities/openclaw-instance.entity").OpenClawInstanceEntity[]>;
    registerInstance(user: ICurrentUser, dto: RegisterInstanceDto): Promise<import("../entities/openclaw-instance.entity").OpenClawInstanceEntity>;
    deleteInstance(user: ICurrentUser, id: number): Promise<null>;
    syncAgent(user: ICurrentUser, id: number): Promise<{
        success: boolean;
        message: string;
    }>;
    getStatus(user: ICurrentUser, id: number): Promise<{
        status: string;
        endpoint: string;
        lastHeartbeatAt: Date | undefined;
    }>;
    updateConfig(user: ICurrentUser, id: number, dto: UpdateConfigDto): Promise<import("../entities/openclaw-instance.entity").OpenClawInstanceEntity>;
}
