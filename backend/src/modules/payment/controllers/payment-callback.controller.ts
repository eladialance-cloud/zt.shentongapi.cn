import { Body, Controller, Headers, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { PaymentCallbackService } from '../services/payment-callback.service';

/**
 * 支付回调控制器（微信/支付宝/Stripe）
 * 注意：使用 @Res 直接写响应，绕过全局响应包装，满足各平台回执格式。
 */
@ApiTags('支付-回调')
@Controller('payments')
export class PaymentCallbackController {
  constructor(private readonly service: PaymentCallbackService) {}

  @Post('wechat/notify')
  @Public()
  async wechatNotify(@Req() req: Request, @Res() res: Response) {
    try {
      const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') || JSON.stringify(req.body || {});
      await this.service.wechatNotify(req.headers as Record<string, string | undefined>, rawBody);
      res.status(200).json({ code: 'SUCCESS', message: '成功' });
    } catch (err) {
      this.logger('wechat', err);
      res.status(500).json({ code: 'FAIL', message: '处理失败' });
    }
  }

  @Post('alipay/notify')
  @Public()
  async alipayNotify(@Body() body: Record<string, unknown>, @Res() res: Response) {
    try {
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(body || {})) {
        params[k] = String(v ?? '');
      }
      await this.service.alipayNotify(params);
      res.status(200).send('success');
    } catch (err) {
      this.logger('alipay', err);
      res.status(500).send('failure');
    }
  }

  @Post('stripe/webhook')
  @Public()
  async stripeWebhook(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string | undefined,
    @Res() res: Response,
  ) {
    try {
      const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') || JSON.stringify(req.body || {});
      await this.service.stripeWebhook(rawBody, signature);
      res.status(200).json({ received: true });
    } catch (err) {
      this.logger('stripe', err);
      res.status(400).json({ error: 'invalid signature or event' });
    }
  }

  private logger(channel: string, err: unknown): void {
    console.error(`[payment-callback:${channel}] ${(err as Error).message}`);
  }
}
