import { ValueTransformer } from 'typeorm';
export declare const bigintTransformer: ValueTransformer;
export declare abstract class BaseEntity {
    id: number;
    createdAt: Date;
    updatedAt: Date;
}
