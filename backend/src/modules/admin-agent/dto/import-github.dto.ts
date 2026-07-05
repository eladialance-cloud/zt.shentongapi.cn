import { IsString, MaxLength } from 'class-validator';

/**
 * GitHub 仓库导入请求
 * 数据合同真源：Task 20 - Agent 市场管理
 */
export class ImportGithubDto {
  @IsString()
  @MaxLength(512)
  repoUrl: string;
}
