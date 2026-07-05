import { PaginationQuery } from '../../../common/types/pagination.type';
export declare class UserQueryDto implements PaginationQuery {
    page?: number;
    pageSize?: number;
    keyword?: string;
}
