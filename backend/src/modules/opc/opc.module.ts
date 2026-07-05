import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpcAgentRepoEntity } from './entities/opc-agent-repo.entity';
import { OpcTaskEntity } from './entities/opc-task.entity';
import { OpcTeamMemberEntity } from './entities/opc-team-member.entity';
import { OpcTeamEntity } from './entities/opc-team.entity';
import { OpcController } from './controllers/opc.controller';
import { OpcService } from './services/opc.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OpcAgentRepoEntity,
      OpcTaskEntity,
      OpcTeamMemberEntity,
      OpcTeamEntity,
    ]),
  ],
  controllers: [OpcController],
  providers: [OpcService],
  exports: [OpcService],
})
export class OpcModule {}
