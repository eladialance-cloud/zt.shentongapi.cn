import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaJobEntity } from './entities/media-job.entity';
import { MediaGenerationController } from './media-generation.controller';
import { MediaGenerationService } from './media-generation.service';
import { GenerationClientService } from './generation-client.service';
import { ModelEntity } from '../model/entities/model.entity';
import { ModelProviderEntity } from '../admin-model/entities/model-provider.entity';
import { FileEntity } from '../file/entities/file.entity';
import { CreditsModule } from '../credits/credits.module';
import { CommonModule } from '../../common/common.module';
import { AdminOssModule } from '../admin-oss/admin-oss.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MediaJobEntity, ModelEntity, ModelProviderEntity, FileEntity]),
    CreditsModule,
    CommonModule,
    AdminOssModule,
  ],
  controllers: [MediaGenerationController],
  providers: [MediaGenerationService, GenerationClientService],
  exports: [MediaGenerationService, GenerationClientService],
})
export class MediaGenerationModule {}
