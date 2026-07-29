export declare class UpdateAnnouncementDto {
    title?: string;
    content?: string;
    type?: 'info' | 'warning' | 'critical';
    scope?: 'all' | 'level_specific';
    targetLevel?: number;
    isActive?: boolean;
}
