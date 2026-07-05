import { IsInt, Min } from 'class-validator';

/**
 * 调整用户等级请求
 * 数据合同真源：Task 18 - 用户管理
 * 用于 PATCH /admin/users/:id/level
 */
export class UpdateUserLevelDto {
  @IsInt()
  @Min(0)
  level: number;
}
