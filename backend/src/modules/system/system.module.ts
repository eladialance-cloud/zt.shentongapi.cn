import { Module } from '@nestjs/common';
import { SystemController } from './controllers/system.controller';
import { SystemService } from './services/system.service';

@Module({
  controllers: [SystemController],
  providers: [SystemService],
  exports: [SystemService],
})
export class SystemModule {}
