import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentConfigEntity } from '../entities/payment-config.entity';

export type PaymentChannel = 'wechat' | 'alipay' | 'stripe';

/** 敏感密钥字段（列表接口脱敏，避免明文回传管理端） */
const SENSITIVE_CONFIG_KEYS = new Set([
  'apiV3Key',
  'privateKey',
  'merchantPrivateKey',
  'secretKey',
  'webhookSecret',
]);

/** 渠道配置脱敏：密钥字段值替换为 '***' 占位，其余字段原样保留 */
function maskConfig(config?: Record<string, unknown>): Record<string, unknown> {
  if (!config) return {};
  const masked: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    masked[k] = SENSITIVE_CONFIG_KEYS.has(k) && v ? '***' : v;
  }
  return masked;
}

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

  /** 全部渠道配置（敏感字段脱敏后返回，避免密钥明文回传） */
  async list(): Promise<PaymentConfigEntity[]> {
    const rows = await this.configRepo.find({ order: { channel: 'ASC' } });
    return rows.map((row) => ({ ...row, config: maskConfig(row.config) }));
  }

  /** 更新渠道配置（不存在则创建） */
  async update(channel: PaymentChannel, dto: UpdatePaymentConfigDto): Promise<PaymentConfigEntity> {
    let cfg = await this.configRepo.findOne({ where: { channel } });
    if (!cfg) {
      cfg = this.configRepo.create({ channel, enabled: false, isMock: true });
    }
    if (dto.displayName !== undefined) cfg.displayName = dto.displayName;
    if (dto.enabled !== undefined) cfg.enabled = dto.enabled;
    if (dto.config !== undefined) {
      // 合并保存：跳过 '***' 占位（未修改的密钥保持不变，避免脱敏后保存被清空）
      const merged = { ...(cfg.config || {}) };
      for (const [k, v] of Object.entries(dto.config)) {
        if (v !== '***') merged[k] = v;
      }
      cfg.config = merged;
    }
    if (dto.isMock !== undefined) cfg.isMock = dto.isMock;
    return this.configRepo.save(cfg);
  }
}
