import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SkillSourceEntity } from './entities/skill-source.entity';
import { SkillPackageEntity } from './entities/skill-package.entity';
import { SkillInstallLogEntity } from './entities/skill-install-log.entity';
import { ChatSessionEntity } from '../chat/entities/chat-session.entity';
import { SkillStoreController } from './controllers/skill-store.controller';
import { SkillStoreService } from './services/skill-store.service';
import { SkillAnalyzerService } from './services/skill-analyzer.service';
import { SkillRunnerService } from './services/skill-runner.service';
import { GitHubAdapter } from './adapters/github-adapter';
import { ManifestGenerator } from './adapters/manifest-generator';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SkillSourceEntity,
      SkillPackageEntity,
      SkillInstallLogEntity,
      ChatSessionEntity,
    ]),
    CreditsModule,
  ],
  controllers: [SkillStoreController],
  providers: [
    SkillStoreService,
    SkillAnalyzerService,
    SkillRunnerService,
    GitHubAdapter,
    ManifestGenerator,
  ],
  exports: [SkillStoreService, SkillAnalyzerService, SkillRunnerService],
})
export class SkillStoreModule {}
