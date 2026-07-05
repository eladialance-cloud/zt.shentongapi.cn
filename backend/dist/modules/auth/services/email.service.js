"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var EmailService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nodemailer = __importStar(require("nodemailer"));
let EmailService = EmailService_1 = class EmailService {
    config;
    logger = new common_1.Logger(EmailService_1.name);
    transporter = null;
    from;
    isDev;
    constructor(config) {
        this.config = config;
        const host = this.config.get('SMTP_HOST');
        const from = this.config.get('SMTP_FROM');
        this.isDev = !host;
        this.from = from || 'noreply@shentong.ai';
        if (host) {
            const port = Number(this.config.get('SMTP_PORT', '587'));
            const user = this.config.get('SMTP_USER');
            const pass = this.config.get('SMTP_PASS');
            this.transporter = nodemailer.createTransport({
                host,
                port,
                secure: port === 465,
                auth: user ? { user, pass } : undefined,
            });
        }
    }
    async sendPasswordResetEmail(email, resetLink) {
        const subject = '【深瞳 AI】密码重置';
        const html = this.buildResetEmailHtml(resetLink);
        if (this.isDev || !this.transporter) {
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
    buildResetEmailHtml(resetLink) {
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
};
exports.EmailService = EmailService;
exports.EmailService = EmailService = EmailService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], EmailService);
//# sourceMappingURL=email.service.js.map