import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { RoleEntity } from './entities/role.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { TeamEntity } from './entities/team.entity';
import { TeamMemberEntity } from './entities/team-member.entity';
import { InviteCodeEntity } from './entities/invite-code.entity';
import { UserController } from './controllers/user.controller';
import { UserService } from './services/user.service';
import { InviteCodeService } from './invite-code.service';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      RoleEntity,
      UserRoleEntity,
      TeamEntity,
      TeamMemberEntity,
      InviteCodeEntity,
    ]),
    CommonModule,
  ],
  controllers: [UserController],
  providers: [UserService, InviteCodeService],
  exports: [UserService, InviteCodeService],
})
export class UserModule {}
