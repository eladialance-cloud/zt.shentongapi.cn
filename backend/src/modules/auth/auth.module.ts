import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { TokenService } from './services/token.service';
import { EmailService } from './services/email.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { UserModule } from '../user/user.module';
import { CommonModule } from '../../common/common.module';
import { DeviceModule } from '../device/device.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    UserModule,
    CommonModule,
    DeviceModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, EmailService, JwtStrategy, LocalStrategy],
  exports: [AuthService, TokenService, JwtStrategy],
})
export class AuthModule {}
