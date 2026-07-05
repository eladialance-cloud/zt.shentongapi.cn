import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModelEntity } from './entities/model.entity';
import { ModelController } from './controllers/model.controller';
import { ModelService } from './services/model.service';

@Module({
  imports: [TypeOrmModule.forFeature([ModelEntity])],
  controllers: [ModelController],
  providers: [ModelService],
  exports: [ModelService],
})
export class ModelModule {}
