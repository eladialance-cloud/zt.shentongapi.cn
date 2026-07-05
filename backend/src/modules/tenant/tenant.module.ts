import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeamEntity } from '../user/entities/team.entity';
import { TeamMemberEntity } from '../user/entities/team-member.entity';
import { TenantController } from './controllers/tenant.controller';
import { TenantService } from './services/tenant.service';

@Module({
  imports: [TypeOrmModule.forFeature([TeamEntity, TeamMemberEntity])],
  controllers: [TenantController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
