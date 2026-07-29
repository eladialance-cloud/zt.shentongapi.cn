import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateInviteCodesDto {
  @ApiProperty({ description: '生成数量 1-100', example: 10, default: 10 })
  @IsInt({ message: '数量必须为整数' })
  @Min(1, { message: '数量最少为 1' })
  @Max(100, { message: '数量最多为 100' })
  @Type(() => Number)
  count: number;

  @ApiProperty({
    description: '有效期天数 1-90',
    example: 30,
    required: false,
    default: 30,
  })
  @IsOptional()
  @IsInt({ message: '有效期天数必须为整数' })
  @Min(1, { message: '有效期天数最少为 1' })
  @Max(90, { message: '有效期天数最多为 90' })
  @Type(() => Number)
  expireDays?: number;
}
