import { IsArray, IsString, IsNotEmpty } from 'class-validator';

export class UpdatePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  permissionCodes: string[];
}
