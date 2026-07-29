import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsObject } from 'class-validator';

export class TriggerWorkflowDto {
  @ApiPropertyOptional({
    description: '工作流输入数据',
    example: '{"key":"value"}',
  })
  @IsOptional()
  @IsObject()
  inputData?: Record<string, unknown>;
}
