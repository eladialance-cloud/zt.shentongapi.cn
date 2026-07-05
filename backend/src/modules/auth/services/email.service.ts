import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * 邮件服务
 * 数据合同真源：Task 5 - 密码重置邮件
 *
 * 开发模式（未配置 SMTP_HOST）：仅打印到控制台，不实际发送
 * 生产模式：使用 nodemailer + SMTP 发送
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private readonly from: string;
  private readonly isDev: boolean;

  constructor(private config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    const from = this.config.get<string>('SMTP_FROM');

    this.isDev = !host;
    this.from = from || 'noreply@shentong.ai';

    if (host) {
      const port = Number(this.config.get<string>('SMTP_PORT', '587'));
      const user = this.config.get<string>('SMTP_USER');
      const pass = this.config.get<string>('SMTP_PASS');
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user ? { user, pass } : undefined,
      });
    }
  }

  /**
   * 发送密码重置邮件
   * @param email 收件人邮箱
   * @param resetLink 重置链接（含 token）
   */
  async sendPasswordResetEmail(email: string, resetLink: string): Promise<void> {
    const subject = '【深瞳 AI】密码重置';
    const html = this.buildResetEmailHtml(resetLink);

    if (this.isDev || !this.transporter) {
      // 开发模式：打印到控制台
      this.logger.warn('========== [DEV] 密码重置邮件 ==========');
      this.logger.warn(`收件人: ${email}`);
      this.logger.warn(`主题: ${subject}`);
      this.logger.warn(`重置链接: ${resetLink}`);
      this.logger.warn('========================================');
      return;
    }

    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject,
      html,
    });
  }

  /** 构建密码重置邮件 HTML 模板 */
  private buildResetEmailHtml(resetLink: string): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f5f5f5; padding:24px;">
  <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6); padding:24px 32px;">
      <h1 style="color:#fff; margin:0; font-size:20px;">深瞳 AI</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#1f2937; margin:0 0 16px;">密码重置</h2>
      <p style="color:#4b5563; line-height:1.6;">您好，我们收到了您的密码重置请求。请点击下方按钮重置密码：</p>
      <div style="text-align:center; margin:24px 0;">
        <a href="${resetLink}" style="display:inline-block; background:#6366f1; color:#fff; text-decoration:none; padding:12px 32px; border-radius:6px; font-weight:600;">重置密码</a>
      </div>
      <p style="color:#6b7280; font-size:13px; line-height:1.6;">
        如果按钮无法点击，请复制以下链接到浏览器：<br/>
        <a href="${resetLink}" style="color:#6366f1; word-break:break-all;">${resetLink}</a>
      </p>
      <div style="margin-top:24px; padding-top:24px; border-top:1px solid #e5e7eb;">
        <p style="color:#ef4444; font-size:13px; margin:0;">
          ⚠ 该链接 30 分钟内有效，请尽快操作。
        </p>
        <p style="color:#9ca3af; font-size:12px; margin:8px 0 0;">
          如果这不是您本人的操作，请忽略此邮件，您的密码不会变更。
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
  }
}
