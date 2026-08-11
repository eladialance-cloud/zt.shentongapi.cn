import { IsIn, IsOptional, IsString, IsUrl, MaxLength, Matches } from 'class-validator';
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
}
