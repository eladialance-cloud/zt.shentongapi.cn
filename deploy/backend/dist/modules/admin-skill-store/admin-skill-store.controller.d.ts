import { AdminSkillStoreService } from './admin-skill-store.service';
import { CreateSkillSourceDto, SkillSourceQueryDto } from './dto/skill-source.dto';
import { UpdateSkillPackageDto, SkillPackageQueryDto, RejectSkillPackageDto } from './dto/skill-package.dto';
export declare class AdminSkillStoreController {
    private readonly service;
    constructor(service: AdminSkillStoreService);
    createSource(dto: CreateSkillSourceDto): Promise<import("../skill-store/entities/skill-source.entity").SkillSourceEntity>;
    listSources(query: SkillSourceQueryDto): Promise<{
        list: import("../skill-store/entities/skill-source.entity").SkillSourceEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    analyze(id: number): Promise<{
        status: string;
        message: string;
    }>;
    removeSource(id: number): Promise<null>;
    listPackages(query: SkillPackageQueryDto): Promise<{
        list: import("../skill-store/entities/skill-package.entity").SkillPackageEntity[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    packageDetail(id: number): Promise<import("../skill-store/entities/skill-package.entity").SkillPackageEntity>;
    updatePackage(id: number, dto: UpdateSkillPackageDto): Promise<null>;
    submitReview(id: number): Promise<null>;
    approve(id: number): Promise<null>;
    reject(id: number, dto: RejectSkillPackageDto): Promise<null>;
    publish(id: number): Promise<null>;
    unpublish(id: number): Promise<null>;
    removePackage(id: number): Promise<null>;
    healthCheck(id: number): Promise<{
        healthy: boolean;
        detail: string;
    }>;
}
