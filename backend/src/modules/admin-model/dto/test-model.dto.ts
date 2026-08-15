import { IsString, MaxLength, IsOptional, IsArray } from 'class-validator';

/**
 * 模型测试 DTO
 * 数据合同真源：Task 23 - 大模型配置
 */
export class TestModelDto {
  @IsString()
  @MaxLength(4096)
  input: string;

  /** 图生图/图像编辑测试的可选参考图（http(s) 公网 URL） */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  inputImages?: string[];
}
