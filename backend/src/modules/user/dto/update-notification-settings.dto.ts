import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, ValidateNested } from 'class-validator';

export class EmailNotificationSettingsDto {
  @ApiPropertyOptional({ description: '对话完成（邮件通知）', default: true })
  @IsOptional()
  @IsBoolean()
  chatCompleted?: boolean;

  @ApiPropertyOptional({ description: '积分变动（邮件通知）', default: true })
  @IsOptional()
  @IsBoolean()
  creditsChanged?: boolean;

  @ApiPropertyOptional({ description: '系统公告（邮件通知）', default: true })
  @IsOptional()
  @IsBoolean()
  systemAnnouncement?: boolean;
}

export class PushNotificationSettingsDto {
  @ApiPropertyOptional({ description: '对话回复（客户端推送）', default: true })
  @IsOptional()
  @IsBoolean()
  chatReply?: boolean;

  @ApiPropertyOptional({ description: 'Agent 审核结果（客户端推送）', default: true })
  @IsOptional()
  @IsBoolean()
  agentReviewResult?: boolean;

  @ApiPropertyOptional({ description: '充值到账（客户端推送）', default: true })
  @IsOptional()
  @IsBoolean()
  rechargeArrived?: boolean;
}

export class UpdateNotificationSettingsDto {
  @ApiPropertyOptional({ type: EmailNotificationSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailNotificationSettingsDto)
  emailNotifications?: EmailNotificationSettingsDto;

  @ApiPropertyOptional({ type: PushNotificationSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PushNotificationSettingsDto)
  pushNotifications?: PushNotificationSettingsDto;
}
