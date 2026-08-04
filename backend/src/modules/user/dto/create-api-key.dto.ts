import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ description: 'API Key 别名' })
  @IsString()
  @IsNotEmpty({ message: '别名不能为空' })
  @MaxLength(128, { message: '别名长度不超过128' })
  alias: string;
}
