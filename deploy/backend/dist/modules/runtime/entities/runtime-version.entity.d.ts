import { BaseEntity } from '../../../common/entities/base.entity';
export declare class RuntimeVersionEntity extends BaseEntity {
    serviceName: string;
    version: string;
    platform: string;
    downloadUrl: string;
    sha256: string;
    changelog?: string;
    isActive: boolean;
    forceUpdate: boolean;
    minAppVersion?: string;
}
