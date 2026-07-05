import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PluginEntity } from './entities/plugin.entity';
import { PluginController } from './controllers/plugin.controller';
import { PluginService } from './services/plugin.service';

@Module({
  imports: [TypeOrmModule.forFeature([PluginEntity])],
  controllers: [PluginController],
  providers: [PluginService],
  exports: [PluginService],
})
export class PluginModule {}
