export declare class CreateSensitiveWordDto {
    word: string;
    category: 'politics' | 'porn' | 'violence' | 'ad' | 'other';
    level: 'block' | 'replace' | 'review';
    replacement?: string;
}
