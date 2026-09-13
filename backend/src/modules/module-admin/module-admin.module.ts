import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { ModuleAdminController } from './module-admin.controller';
import { ModuleAdminService } from './module-admin.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [ModuleAdminController],
  providers: [ModuleAdminService],
  exports: [ModuleAdminService],
})
export class ModuleAdminModule {}