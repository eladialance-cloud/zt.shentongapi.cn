import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWorkflowLibDto {
  @ApiProperty({ description: '工作流名称' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(128)
  name: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: '分类',
    enum: ['ai_collaboration', 'independent', 'automation'],
  })
  @IsOptional()
  @IsEnum(['ai_collaboration', 'independent', 'automation'])
  category?: string;

  @ApiPropertyOptional({ description: 'N8N 工作流 JSON 定义' })
  @IsOptional()
  @IsString()
  workflowJson?: string;

  @ApiPropertyOptional({ description: 'GitHub 来源仓库' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  sourceRepo?: string;

  @ApiPropertyOptional({ description: '来源文件路径' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  sourcePath?: string;

  @ApiPropertyOptional({ description: '版本号' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  version?: string;

  @ApiPropertyOptional({ description: '图标 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  icon?: string;

  @ApiPropertyOptional({ description: '标签', type: [String] })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ description: '参数表单定义（JSON Schema）' })
  @IsOptional()
  inputSchema?: Record<string, unknown>;
}

export class UpdateWorkflowLibDto {
  @ApiPropertyOptional({ description: '工作流名称' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '分类' })
  @IsOptional()
  @IsEnum(['ai_collaboration', 'independent', 'automation'])
  category?: string;

  @ApiPropertyOptional({ description: 'N8N 工作流 JSON 定义' })
  @IsOptional()
  @IsString()
  workflowJson?: string;

  @ApiPropertyOptional({ description: '版本号' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  version?: string;

  @ApiPropertyOptional({ description: '图标 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  icon?: string;

  @ApiPropertyOptional({ description: '标签' })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ description: '参数表单定义' })
  @IsOptional()
  inputSchema?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '发布状态' })
  @IsOptional()
  @IsEnum(['draft', 'pending_review', 'approved', 'published', 'rejected'])
  publishStatus?: string;

  @ApiPropertyOptional({ description: '是否发布' })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class ImportGithubWorkflowDto {
  @ApiProperty({ description: 'GitHub 仓库 URL' })
  @IsNotEmpty()
  @IsString()
  repoUrl: string;

  @ApiPropertyOptional({ description: '文件路径（如 workflows/example.json）' })
  @IsOptional()
  @IsString()
  filePath?: string;

  @ApiPropertyOptional({ description: '分类' })
  @IsOptional()
  @IsEnum(['ai_collaboration', 'independent', 'automation'])
  category?: string;
}
