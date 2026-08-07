import { IsIn, IsString, MaxLength } from 'class-validator';

/**
 * 本地上传技能源请求（multipart 表单字段）
 * 文件字段名为 file（.zip）
 */
export class UploadSkillSourceDto {
  @IsString()
  @MaxLength(64)
  skillName: string;

  @IsString()
  @MaxLength(512)
  skillDesc: string;

  @IsIn(['skill', 'workflow'])
  skillType: 'skill' | 'workflow';
}
