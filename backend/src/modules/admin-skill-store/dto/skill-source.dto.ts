import { IsString, Matches, IsIn, MaxLength, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSkillSourceDto {
  @IsString()
  @Matches(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/, { message: '仅支持 GitHub URL' })
  sourceUrl: string;

  @IsIn(['github'])
  sourceType: 'github';

  @IsString()
  @MaxLength(64)
  skillName: string;

  @IsString()
  @MaxLength(512)
  skillDesc: string;

  @IsIn(['skill', 'workflow'])
  skillType: 'skill' | 'workflow';
}

export class SkillSourceQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @IsOptional()
  @IsIn(['pending', 'analyzing', 'analyzed', 'failed'])
  status?: string;

  @IsOptional()
  @IsIn(['skill', 'workflow'])
  skillType?: string;
}
