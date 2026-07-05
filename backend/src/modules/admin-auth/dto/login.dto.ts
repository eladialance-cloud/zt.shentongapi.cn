import { IsString, IsNotEmpty, MinLength } from 'class-validator';

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

/**
 * 管理员修改密码请求体
 * 用于默认管理员账号首次登录强制改密场景。
 */
export class AdminChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  oldPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
