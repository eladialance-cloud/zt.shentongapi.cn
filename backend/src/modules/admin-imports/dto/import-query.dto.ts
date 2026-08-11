import { IsIn, IsOptional, IsString } from 'class-validator';
import { IMPORT_TYPES } from '../admin-imports.constants';

export class ImportQueryDto {
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() pageSize?: string;
  @IsOptional() @IsIn(IMPORT_TYPES) type?: string;
  @IsOptional() @IsIn(['pending', 'processing', 'succeeded', 'failed']) status?: string;
}
