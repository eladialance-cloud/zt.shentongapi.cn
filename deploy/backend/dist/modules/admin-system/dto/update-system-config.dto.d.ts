export declare class UpdateSystemConfigDto {
    section: 'cache' | 'rate_limit' | 'notification' | 'payment';
    config: Record<string, unknown>;
}
