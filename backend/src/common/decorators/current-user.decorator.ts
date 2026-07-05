import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface ICurrentUser {
  userId: number;
  username: string;
  email: string;
  roles: string[];
}

/**
 * 获取当前登录用户信息参数装饰器
 * 数据合同真源：spec.md - JWT 认证机制
 */
export const CurrentUser = createParamDecorator(
  (data: keyof ICurrentUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as ICurrentUser;
    return data ? user?.[data] : user;
  },
);
