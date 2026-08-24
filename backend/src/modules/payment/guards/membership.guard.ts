/**
 * 会员功能守卫（M7-3）
 *
 * 用法：
 *   @UseGuards(MembershipGuard)
 *   @RequireFeature('voice_clone')
 *   无 RequireFeature 元数据的方法不做会员校验（放行）。
 * 错误码：MEMBERSHIP_REQUIRED（免费档使用付费功能）/ FEATURE_LOCKED（功能未开放/超限）
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';
import { MembershipService, MembershipFeatureName } from '../services/membership.service';

export const MEMBERSHIP_FEATURE_KEY = 'membership:feature';

/** 标注接口需要的能力 */
export function RequireFeature(feature: MembershipFeatureName): MethodDecorator & ClassDecorator {
  return (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (descriptor && key) {
      Reflect.defineMetadata(MEMBERSHIP_FEATURE_KEY, feature, descriptor.value);
    } else {
      Reflect.defineMetadata(MEMBERSHIP_FEATURE_KEY, feature, target);
    }
  };
}

@Injectable()
export class MembershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly membership: MembershipService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<MembershipFeatureName | undefined>(MEMBERSHIP_FEATURE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!feature) return true;
    const req = ctx.switchToHttp().getRequest();
    const userId = req.user?.userId;
    if (!userId) throw new BusinessException(ErrorCode.MEMBERSHIP_REQUIRED, '请先登录');
    await this.membership.ensureFeature(userId, feature);
    return true;
  }
}
