import { IsIn, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Matches, Min } from 'class-validator';
import { IMPORT_TYPES } from '../admin-imports.constants';

export class CreateImportDto {
  @IsIn(IMPORT_TYPES, { message: 'type 必须是 agent/workflow/mcp/skill/skill_pack/n8n_mcp' })
  type: (typeof IMPORT_TYPES)[number];

  @IsUrl({ protocols: ['https'], require_protocol: true })
  @Matches(/^https:\/\/github\.com\/[^/]+\/[^/]+/, { message: '必须是 GitHub 仓库地址' })
  repoUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  branch?: string;

  /** 技能目录仓库展开数量（仅 type=skill 且仓库为 categories/*.md 目录时生效，默认 100，最大 200） */
  @IsOptional()
  @IsInt({ message: 'maxSkills 必须是整数' })
  @Min(1, { message: 'maxSkills 最小为 1' })
  @Max(200, { message: 'maxSkills 最大为 200' })
  maxSkills?: number;
}
