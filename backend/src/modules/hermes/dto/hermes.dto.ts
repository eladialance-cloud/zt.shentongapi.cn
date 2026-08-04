import { IsString, IsOptional, IsArray, IsNumber, IsEnum, IsObject, Min, Max, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInstanceDto {
  @ApiProperty({ description: '实例名称', maxLength: 64 })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '初始挂载技能包ID列表' })
  @IsOptional()
  @IsArray()
  skillIds?: number[];
}

export class PaginationDto {
  @ApiPropertyOptional({ description: '页码', default: 1 })
  @IsOptional()
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({ description: '每页条数', default: 10 })
  @IsOptional()
  @IsNumber()
  pageSize?: number;
}

export class ExecuteTaskDto {
  @ApiProperty({
    description: '调用类型',
    enum: ['skill_execute', 'tool_call', 'agent_invoke', 'workflow_run'],
  })
  @IsEnum(['skill_execute', 'tool_call', 'agent_invoke', 'workflow_run'])
  callType: 'skill_execute' | 'tool_call' | 'agent_invoke' | 'workflow_run';

  @ApiProperty({ description: '调用目标名称' })
  @IsString()
  target: string;

  @ApiPropertyOptional({ description: '输入参数' })
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '每分钟积分单价（0=免费）', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerMinute?: number;

  // 各类型特定参数
  @ApiPropertyOptional({ description: '技能包ID（callType=skill_execute 时必填）' })
  @IsOptional()
  @IsNumber()
  skillId?: number;

  @ApiPropertyOptional({ description: 'MCP服务器ID（callType=tool_call 时必填）' })
  @IsOptional()
  @IsString()
  serverId?: string;

  @ApiPropertyOptional({ description: '工具名称（callType=tool_call 时必填）' })
  @IsOptional()
  @IsString()
  toolName?: string;

  @ApiPropertyOptional({ description: '工具参数（callType=tool_call 时使用）' })
  @IsOptional()
  @IsObject()
  args?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Agent ID（callType=agent_invoke 时必填）' })
  @IsOptional()
  @IsNumber()
  agentId?: number;

  @ApiPropertyOptional({ description: 'OPC 团队 ID（callType=agent_invoke 时可选，表示调用整个团队）' })
  @IsOptional()
  @IsNumber()
  teamId?: number;

  @ApiPropertyOptional({ description: 'N8N实例ID（callType=workflow_run 时必填）' })
  @IsOptional()
  @IsNumber()
  n8nInstanceId?: number;

  @ApiPropertyOptional({ description: '工作流ID（callType=workflow_run 时必填）' })
  @IsOptional()
  @IsString()
  workflowId?: string;
}

export class RateSkillDto {
  @ApiProperty({ description: '评分（1-5）', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ description: '评论' })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class CreateSkillDto {
  @ApiProperty({ description: '技能包名称', maxLength: 128 })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '作者' })
  @IsOptional()
  @IsString()
  author?: string;

  @ApiPropertyOptional({ description: '积分/分钟', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerMinute?: number;

  @ApiPropertyOptional({ description: '分类' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: '标签' })
  @IsOptional()
  @IsArray()
  tags?: string[];

  @ApiPropertyOptional({ description: '执行配置' })
  @IsOptional()
  @IsObject()
  execConfig?: Record<string, unknown>;
}
