import { ConfigService } from '@nestjs/config';
import { JwtModuleOptions } from '@nestjs/jwt';
export declare const jwtConfig: (config: ConfigService) => JwtModuleOptions;
