import { BaseEntity } from '../../../common/entities/base.entity';
export declare class SensitiveWordEntity extends BaseEntity {
    word: string;
    category: 'politics' | 'porn' | 'violence' | 'ad' | 'other';
    level: 'block' | 'replace' | 'review';
    replacement?: string;
}
