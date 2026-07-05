import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceEntity } from './entities/device.entity';
import { DeviceService } from './device.service';
import { DeviceController, AdminDeviceController } from './device.controller';

/**
 * 设备绑定模块
 * 数据合同真源：Task 4 - 设备指纹与绑定机制
 */
@Module({
  imports: [TypeOrmModule.forFeature([DeviceEntity])],
  controllers: [DeviceController, AdminDeviceController],
  providers: [DeviceService],
  exports: [DeviceService],
})
export class DeviceModule {}
