import { ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { HermesService } from '../services/hermes.service';
import { CreateInstanceDto, PaginationDto } from '../dto/hermes.dto';
export declare class HermesController {
    private readonly service;
    constructor(service: HermesService);
    health(): {
        status: string;
        module: string;
    };
    listInstances(user: ICurrentUser): Promise<import("../entities/hermes-instance.entity").HermesInstanceEntity[]>;
    createInstance(user: ICurrentUser, dto: CreateInstanceDto): Promise<import("../entities/hermes-instance.entity").HermesInstanceEntity>;
    getInstance(user: ICurrentUser, id: number): Promise<import("../entities/hermes-instance.entity").HermesInstanceEntity>;
    startInstance(user: ICurrentUser, id: number): Promise<import("../entities/hermes-instance.entity").HermesInstanceEntity>;
    stopInstance(user: ICurrentUser, id: number): Promise<import("../entities/hermes-instance.entity").HermesInstanceEntity>;
    deleteInstance(user: ICurrentUser, id: number): Promise<null>;
    getCallLogs(user: ICurrentUser, id: number, query: PaginationDto): Promise<{
        list: import("../entities/hermes-call-log.entity").HermesCallLogEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    unmountSkill(user: ICurrentUser, id: number, skillId: number): Promise<import("../entities/hermes-instance.entity").HermesInstanceEntity>;
    listMarketSkills(): Promise<import("../entities/hermes-skill.entity").HermesSkillEntity[]>;
    listInstalledSkills(user: ICurrentUser): Promise<import("../entities/hermes-skill.entity").HermesSkillEntity[]>;
    installSkill(user: ICurrentUser, skillId: number): Promise<import("../entities/hermes-skill.entity").HermesSkillEntity>;
}
