import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PluginEntity } from './entities/plugin.entity';
import { UserPluginEntity } from './entities/user-plugin.entity';
import { PluginController } from './controllers/plugin.controller';
import { PluginService } from './services/plugin.service';

@Module({
  imports: [TypeOrmModule.forFeature([PluginEntity, UserPluginEntity])],
  controllers: [PluginController],
  providers: [PluginService],
  exports: [PluginService],
})
export class PluginModule {}
