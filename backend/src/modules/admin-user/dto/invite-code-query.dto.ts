import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class InviteCodeQueryDto {
  @ApiProperty({
    description: '状态筛选: active/used/revoked/expired',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['active', 'used', 'revoked', 'expired'])
  status?: string;

  @ApiProperty({ description: '页码', required: false, default: 1 })
  @IsOptional()
  @IsInt({ message: '页码必须为整数' })
  @Min(1, { message: '页码最小为 1' })
  @Type(() => Number)
  page?: number;

  @ApiProperty({ description: '每页数量', required: false, default: 20 })
  @IsOptional()
  @IsInt({ message: '每页数量必须为整数' })
  @Min(1, { message: '每页数量最小为 1' })
  @Max(100, { message: '每页数量最多为 100' })
  @Type(() => Number)
  pageSize?: number;
}
