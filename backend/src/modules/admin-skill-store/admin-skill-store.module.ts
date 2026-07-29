import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { SkillStoreModule } from '../skill-store/skill-store.module';
import { SkillSourceEntity } from '../skill-store/entities/skill-source.entity';
import { SkillPackageEntity } from '../skill-store/entities/skill-package.entity';
import { SkillInstallLogEntity } from '../skill-store/entities/skill-install-log.entity';
import { AdminSkillStoreController } from './admin-skill-store.controller';
import { AdminSkillStoreService } from './admin-skill-store.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SkillSourceEntity, SkillPackageEntity, SkillInstallLogEntity]),
    AdminAuthModule,
    SkillStoreModule,
  ],
  controllers: [AdminSkillStoreController],
  providers: [AdminSkillStoreService],
  exports: [AdminSkillStoreService],
})
export class AdminSkillStoreModule {}
