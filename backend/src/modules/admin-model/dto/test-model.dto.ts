import { IsString, MaxLength } from 'class-validator';

/**
 * 模型测试 DTO
 * 数据合同真源：Task 23 - 大模型配置
 */
export class TestModelDto {
  @IsString()
  @MaxLength(4096)
  input: string;
}
