import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TeamEntity } from "./entities/team.entity";
import { TeamMemberEntity } from "./entities/team-member.entity";
import { TeamTaskEntity } from "./entities/team-task.entity";
import { TeamController } from "./controllers/team.controller";
import { TeamService } from "./services/team.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TeamEntity,
      TeamMemberEntity,
      TeamTaskEntity,
    ]),
  ],
  controllers: [TeamController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}
