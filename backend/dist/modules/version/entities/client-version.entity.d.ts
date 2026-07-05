import { BaseEntity } from '../../../common/entities/base.entity';
export type ClientPlatform = 'win' | 'mac';
export declare class ClientVersionEntity extends BaseEntity {
    version: string;
    platform: ClientPlatform;
    downloadUrl: string;
    changelog?: string;
    forceUpdate: boolean;
    grayscalePercent: number;
    publishedAt?: Date;
    isActive: boolean;
}
