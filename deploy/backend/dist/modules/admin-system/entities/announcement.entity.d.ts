import { BaseEntity } from '../../../common/entities/base.entity';
export declare class AnnouncementEntity extends BaseEntity {
    title: string;
    content: string;
    type: 'info' | 'warning' | 'critical';
    scope: 'all' | 'level_specific';
    targetLevel?: number;
    isActive: boolean;
    status: 'draft' | 'published';
    publishedAt?: Date;
}
