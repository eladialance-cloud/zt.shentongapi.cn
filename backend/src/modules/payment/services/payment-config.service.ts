import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentConfigEntity } from '../entities/payment-config.entity';

export type PaymentChannel = 'wechat' | 'alipay' | 'stripe';

export interface UpdatePaymentConfigDto {
  displayName?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
  isMock?: boolean;
}

/**
 * 支付渠道配置服务（管理后台）
 * 模拟支付阶段：配置商户参数后仍返回模拟二维码，is_mock 恒为 true，留真实网关接入点
 */
@Injectable()
export class PaymentConfigService {
  constructor(
    @InjectRepository(PaymentConfigEntity)
    private readonly configRepo: Repository<PaymentConfigEntity>,
  ) {}

  /** 全部渠道配置 */
  async list(): Promise<PaymentConfigEntity[]> {
    return this.configRepo.find({ order: { channel: 'ASC' } });
  }

  /** 更新渠道配置（不存在则创建） */
  async update(channel: PaymentChannel, dto: UpdatePaymentConfigDto): Promise<PaymentConfigEntity> {
    let cfg = await this.configRepo.findOne({ where: { channel } });
    if (!cfg) {
      cfg = this.configRepo.create({ channel, enabled: false, isMock: true });
    }
    if (dto.displayName !== undefined) cfg.displayName = dto.displayName;
    if (dto.enabled !== undefined) cfg.enabled = dto.enabled;
    if (dto.config !== undefined) cfg.config = dto.config;
    if (dto.isMock !== undefined) cfg.isMock = dto.isMock;
    return this.configRepo.save(cfg);
  }
}
