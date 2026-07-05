import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceEntity } from './entities/device.entity';
import { BindDeviceDto } from './dto/bind-device.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error.constant';

/** 每用户最多绑定的设备数量 */
const MAX_DEVICE_COUNT = 3;

/**
 * 设备绑定服务
 * 数据合同真源：Task 4 - 设备指纹与绑定机制
 * 业务规则：每用户最多 3 台设备；同指纹已存在则更新登录信息，不新建
 */
@Injectable()
export class DeviceService {
  constructor(
    @InjectRepository(DeviceEntity)
    private deviceRepo: Repository<DeviceEntity>,
  ) {}

  /**
   * 绑定设备：
   * - 已存在同 userId+deviceFingerprint：更新 lastLoginAt / lastLoginIp，不新建
   * - 不存在：校验设备数上限（3 台），超限抛 DEVICE_LIMIT_EXCEEDED，否则新建
   */
  async bindDevice(userId: number, dto: BindDeviceDto, ip: string): Promise<DeviceEntity> {
    const existing = await this.findByFingerprint(userId, dto.deviceFingerprint);
    if (existing) {
      existing.lastLoginAt = new Date();
      existing.lastLoginIp = ip;
      return this.deviceRepo.save(existing);
    }

    // 新设备：校验上限
    const count = await this.getUserDeviceCount(userId);
    if (count >= MAX_DEVICE_COUNT) {
      BusinessException.throw(
        ErrorCode.DEVICE_LIMIT_EXCEEDED,
        `已绑定设备数超过限制（最多 ${MAX_DEVICE_COUNT} 台），请先解绑旧设备`,
      );
    }

    const device = this.deviceRepo.create({
      userId,
      deviceFingerprint: dto.deviceFingerprint,
      deviceName: dto.deviceName,
      deviceType: dto.deviceType,
      lastLoginAt: new Date(),
      lastLoginIp: ip,
      status: 'active',
    });
    return this.deviceRepo.save(device);
  }

  /** 查询用户所有设备 */
  async listDevices(userId: number): Promise<DeviceEntity[]> {
    return this.deviceRepo.find({
      where: { userId },
      order: { lastLoginAt: 'DESC' },
    });
  }

  /** 解绑设备（仅限设备归属用户） */
  async unbindDevice(userId: number, deviceId: number): Promise<void> {
    const device = await this.deviceRepo.findOne({ where: { id: deviceId, userId } });
    if (!device) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '设备不存在或无权操作');
    }
    await this.deviceRepo.delete(deviceId);
  }

  /** 按指纹解绑 */
  async unbindByFingerprint(userId: number, fingerprint: string): Promise<void> {
    await this.deviceRepo.delete({ userId, deviceFingerprint: fingerprint });
  }

  /** 检查是否超出 3 台限制（true 表示已超限） */
  async checkDeviceLimit(userId: number): Promise<boolean> {
    const count = await this.getUserDeviceCount(userId);
    return count >= MAX_DEVICE_COUNT;
  }

  /** 用户已绑定设备数量 */
  async getUserDeviceCount(userId: number): Promise<number> {
    return this.deviceRepo.count({ where: { userId } });
  }

  /** 按指纹查询用户已绑定设备 */
  async findByFingerprint(userId: number, fingerprint: string): Promise<DeviceEntity | null> {
    return this.deviceRepo.findOne({
      where: { userId, deviceFingerprint: fingerprint },
    });
  }

  /** 更新设备登录信息（lastLoginAt / lastLoginIp） */
  async updateLoginInfo(deviceId: number, ip: string): Promise<void> {
    await this.deviceRepo.update(deviceId, {
      lastLoginAt: new Date(),
      lastLoginIp: ip,
    });
  }

  /** 管理端查询用户设备 */
  async adminListDevices(userId: number): Promise<DeviceEntity[]> {
    return this.deviceRepo.find({
      where: { userId },
      order: { lastLoginAt: 'DESC' },
    });
  }

  /** 管理端远程解绑 */
  async adminUnbindDevice(deviceId: number): Promise<void> {
    const device = await this.deviceRepo.findOne({ where: { id: deviceId } });
    if (!device) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '设备不存在');
    }
    await this.deviceRepo.delete(deviceId);
  }
}
