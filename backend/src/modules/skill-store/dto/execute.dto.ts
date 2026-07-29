import { IsObject, IsOptional } from 'class-validator';

export class ExecuteSkillDto {
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}
