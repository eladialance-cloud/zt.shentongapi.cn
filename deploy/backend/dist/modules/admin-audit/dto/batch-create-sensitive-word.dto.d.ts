export declare class BatchSensitiveWordItemDto {
    word: string;
    category: 'politics' | 'porn' | 'violence' | 'ad' | 'other';
    level: 'block' | 'replace' | 'review';
}
export declare class BatchCreateSensitiveWordDto {
    words: BatchSensitiveWordItemDto[];
}
