import { IsString, IsNotEmpty } from 'class-validator';

/**
 * 管理员登录请求体
 * 数据合同真源：Task 17 - 管理端认证与权限
 */
export class AdminLoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  captcha: string;
}
