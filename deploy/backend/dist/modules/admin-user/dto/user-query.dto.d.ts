export declare class UserQueryDto {
    keyword?: string;
    status?: 'active' | 'banned';
    level?: number;
    startTime?: string;
    endTime?: string;
    page?: number;
    pageSize?: number;
}
