import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 拉取上游模型 DTO
 */
export class FetchModelsDto {
  @ApiProperty({ description: 'API Endpoint', example: 'https://api.openai.com/v1', maxLength: 512 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  apiEndpoint: string;

  @ApiProperty({ description: 'API Key', example: 'sk-xxx', maxLength: 256 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  apiKey: string;
}
