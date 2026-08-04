import { PartialType } from '@nestjs/swagger';
import { CreateAgentDto } from './create-agent.dto';

/** 更新 Agent DTO（部分字段，数据合同真源：desktop types/agent-creator UpdateAgentDto） */
export class UpdateAgentDto extends PartialType(CreateAgentDto) {}
