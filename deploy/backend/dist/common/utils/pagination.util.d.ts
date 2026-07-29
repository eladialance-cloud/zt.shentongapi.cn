export interface PaginationResult {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}
export declare function calcPagination(total: number, page: number, pageSize: number): PaginationResult;
