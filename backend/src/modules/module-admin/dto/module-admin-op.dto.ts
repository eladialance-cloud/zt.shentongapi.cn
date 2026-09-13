import { IsIn, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ModuleAdminOpDto {
  @ApiProperty({ description: '模块 id（与 modules/<id> 目录一致）' })
  @IsString()
  moduleId: string;

  @ApiProperty({ description: '处置目标：keep | export | delete', default: 'keep' })
  @IsString()
  @IsIn(['keep', 'export', 'delete'])
  target: 'keep' | 'export' | 'delete' = 'keep';
}