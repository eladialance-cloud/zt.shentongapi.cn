import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HermesCallLogEntity } from './entities/hermes-call-log.entity';
import { HermesSkillEntity } from './entities/hermes-skill.entity';
import { HermesSkillRatingEntity } from './entities/hermes-skill-rating.entity';
import { HermesController } from './controllers/hermes.controller';
import { HermesService } from './services/hermes.service';
import { SkillRunnerService } from './services/skill-runner.service';
import { CreditsModule } from '../credits/credits.module';
import { McpModule } from '../mcp/mcp.module';
import { N8nModule } from '../n8n/n8n.module';
import { OpenClawModule } from '../openclaw/openclaw.module';
import { TeamModule } from '../team/team.module';
import { SyncModule } from '../sync/sync.module';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HermesCallLogEntity,
      HermesSkillEntity,
      HermesSkillRatingEntity,
    ]),
    CreditsModule,
    McpModule,
    N8nModule,
    OpenClawModule,
    TeamModule,
    SyncModule,
  ],
  controllers: [HermesController],
  providers: [HermesService, SkillRunnerService, RolesGuard],
  exports: [HermesService],
})
export class HermesModule {}
