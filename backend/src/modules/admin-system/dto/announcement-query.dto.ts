import {
  IsIn,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';

/**
 * 公告列表查询参数 (GET /admin/announcements)
 * 数据合同真源：Task 28 - 系统配置 / frontend AnnouncementQuery
 */
export class AnnouncementQueryDto {
  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: 'draft' | 'published';

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}
