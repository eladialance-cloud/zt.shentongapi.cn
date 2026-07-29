import { SetMetadata } from '@nestjs/common';

export const REQUIRE_HMAC_KEY = 'require_hmac';

/**
 * 标记接口强制要求 HMAC 验签
 * 标记后：请求必须携带 X-Signature 头，否则返回 401
 * 未标记：保持原行为（无签名放行，由 JwtAuthGuard 兜底）
 * 数据合同真源：Task 32 - 数据安全设计
 */
export const RequireHmac = () => SetMetadata(REQUIRE_HMAC_KEY, true);
