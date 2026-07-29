import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** 创建套餐 DTO */
export class CreatePlanDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(0)
  price: number;

  @IsInt()
  @Min(0)
  credits: number;

  @IsInt()
  @Min(1)
  durationDays: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  level?: number;

  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @IsString({ each: true })
  benefits?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** 更新套餐 DTO */
export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  credits?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  level?: number;

  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @IsString({ each: true })
  benefits?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
