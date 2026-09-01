import { Body, Controller, Get, Headers, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { RemoteService } from "./remote.service";

/**
 * 自动化工作台 - 远程控制控制器
 * 方案文档: 深瞳AI自动化工作台建设方案（代码内置版）B2/B5
 *
 * - POST /api/remote/webhook/feishu  飞书入站（自定义机器人/开放平台事件回调）
 * - GET  /api/remote/health          健康检查
 * 桌面端结果回传走 socket.io sync 命名空间的 remote:result 事件（见 sync.gateway.ts）
 */
@ApiTags("自动化工作台-远程")
@Controller("remote")
export class RemoteController {
  constructor(private readonly remoteService: RemoteService) {}

  @Get("health")
  @Public()
  health() {
    return this.remoteService.health();
  }

  /**
   * 飞书 webhook 入站
   * 注意：使用 @Res 直接写响应，绕过全局响应包装；飞书要求快速返回 200
   */
  @Post("webhook/feishu")
  @Public()
  async feishuWebhook(
    @Req() req: Request,
    @Headers("x-lark-signature") signature: string | undefined,
    @Headers("x-lark-request-timestamp") timestamp: string | undefined,
    @Res() res: Response,
  ) {
    try {
      // 飞书开放平台 URL 验证握手：必须原样回显 challenge，否则事件订阅配置失败
      const body = (req.body ?? {}) as Record<string, any>;
      if (body?.type === "url_verification" && typeof body?.challenge === "string" && body.challenge) {
        res.status(200).json({ challenge: body.challenge });
        return;
      }
      await this.remoteService.handleFeishuInbound(req.body, signature, timestamp);
      res.status(200).json({ code: 0, data: {} });
    } catch (err) {
      console.error(`[remote:feishu-webhook] ${(err as Error).message}`);
      // 飞书重试风暴防护：处理失败也回 200，错误记日志排查
      res.status(200).json({ code: 0, data: {} });
    }
  }
}