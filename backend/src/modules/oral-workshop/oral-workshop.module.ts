import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OralWorkshopJobEntity } from './entities/oral-workshop-job.entity';
import { OralWorkshopStepEntity } from './entities/oral-workshop-step.entity';
import { DigitalHumanAssetEntity } from './entities/digital-human-asset.entity';
import { PublishAccountEntity } from './entities/publish-account.entity';
import { PublishPlatformEntity } from './entities/publish-platform.entity';
import { OralWorkshopController } from './oral-workshop.controller';
import { OralWorkshopService } from './oral-workshop.service';
import { OralWorkshopExecutor } from './oral-workshop.executor';
import { SystemLlmService } from './system-llm.service';
import { OralWorkshopPublisher } from './publisher';
import { OralWorkshopLlmService } from './llm';
import { CreditsModule } from '../credits/credits.module';
import { ChannelModule } from '../channel/channel.module';
import { PaymentModule } from '../payment/payment.module';
import { ApiKeyPoolModule } from '../api-key-pool/api-key-pool.module';
import { CommonModule } from '../../common/common.module';
import { ModelProviderEntity } from '../admin-model/entities/model-provider.entity';
import { SystemConfigEntity } from '../admin-system/entities/system-config.entity';
import { MediaAssetEntity } from '../media-assets/entities/media-asset.entity';
import { MediaAssetsModule } from '../media-assets/media-asset.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OralWorkshopJobEntity,
      OralWorkshopStepEntity,
      DigitalHumanAssetEntity,
      PublishAccountEntity,
      PublishPlatformEntity,
      ModelProviderEntity,
      SystemConfigEntity,
      MediaAssetEntity,
    ]),
    CreditsModule,
    ApiKeyPoolModule,
    CommonModule,
    ChannelModule,
    PaymentModule,
    forwardRef(() => MediaAssetsModule),
  ],
  controllers: [OralWorkshopController],
  providers: [
    OralWorkshopService,
    SystemLlmService,
    {
      provide: OralWorkshopLlmService,
      inject: [SystemLlmService],
      useFactory: (caller: SystemLlmService) => new OralWorkshopLlmService(caller),
    },
    OralWorkshopExecutor,
    OralWorkshopPublisher,
  ],
  exports: [OralWorkshopService, SystemLlmService],
})
export class OralWorkshopModule {}
