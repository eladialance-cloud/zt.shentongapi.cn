import { PaginationQuery } from '../../../common/types/pagination.type';
export declare class DeviceQueryDto implements PaginationQuery {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: string;
}
