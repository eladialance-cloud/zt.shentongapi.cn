import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** 解析官方 curl 示例，生成模型适配配置 */
export class ParseCurlDto {
  @IsNotEmpty({ message: 'curl 内容不能为空' })
  @IsString()
  @MaxLength(20000)
  curlText: string;
}
