export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface PaginatedResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
