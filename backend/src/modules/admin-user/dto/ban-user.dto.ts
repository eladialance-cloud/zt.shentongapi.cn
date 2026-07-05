import { IsString, MaxLength } from 'class-validator';

/**
 * 封禁用户请求
 * 数据合同真源：Task 18 - 用户管理
 */
export class BanUserDto {
  @IsString()
  @MaxLength(512)
  reason: string;
}
