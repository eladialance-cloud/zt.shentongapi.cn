import { Body, Controller, Get, Headers, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { RemoteService } from "./remote.service";

/**
 * 自动化工作台 - 远程控制控制器
 * 方案文档: 深瞳AI自动化工作台建设方案（代码内置版）B1/B2/B5
 *
 * - POST /api/remote/webhook/feishu   飞书入站（自定义机器人/开放平台事件回调）
 * - GET/POST /api/remote/webhook/wechat-mp  公众号接入（GET 验签回显 echostr / POST XML 消息）
 * - GET/POST /api/remote/webhook/wecom  企业微信回调（GET 验签回显 / POST 加密事件）
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

  /** 读取原始请求体（XML/文本平台回调） */
  private rawBodyOf(req: Request): string | undefined {
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    if (raw && raw.length > 0) return raw.toString("utf8");
    return undefined;
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
      const feishuResult = await this.remoteService.handleFeishuInbound(body, signature, timestamp);
      if (feishuResult?.challenge) {
        res.status(200).json({ challenge: feishuResult.challenge });
        return;
      }
      res.status(200).json({ code: 0, data: {} });
    } catch (err) {
      console.error(`[remote:feishu-webhook] ${(err as Error).message}`);
      // 飞书重试风暴防护：处理失败也回 200，错误记日志排查
      res.status(200).json({ code: 0, data: {} });
    }
  }

  /**
   * 公众号接入验证（GET）：signature 校验通过后回显 echostr
   * 微信要求 5 秒内返回明文 echostr
   */
  @Get("webhook/wechat-mp")
  @Public()
  async wechatMpVerify(@Query() query: Record<string, string>, @Res() res: Response) {
    const { echostr } = await this.remoteService.handleWechatMpInbound(null, {
      signature: query.signature,
      timestamp: query.timestamp,
      nonce: query.nonce,
      echostr: query.echostr,
    });
    res.status(200).send(echostr ?? "");
  }

  /** 公众号消息回调（POST）：返回 "success" 即确认接收 */
  @Post("webhook/wechat-mp")
  @Public()
  async wechatMpInbound(
    @Req() req: Request,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    try {
      const raw = this.rawBodyOf(req);
      await this.remoteService.handleWechatMpInbound(raw ?? req.body ?? "", {
        signature: query.signature,
        timestamp: query.timestamp,
        nonce: query.nonce,
      });
    } catch (err) {
      console.error(`[remote:wechat-mp-webhook] ${(err as Error).message}`);
    }
    res.status(200).send("success");
  }

  /** 企业微信接入验证（GET）：msg_signature 校验通过后回显解密后的 echostr */
  @Get("webhook/wecom")
  @Public()
  async wecomVerify(@Query() query: Record<string, string>, @Res() res: Response) {
    const { echostr } = await this.remoteService.handleWecomInbound(null, {
      msgSignature: query.msg_signature,
      timestamp: query.timestamp,
      nonce: query.nonce,
      echostr: query.echostr,
    });
    res.status(200).send(echostr ?? "");
  }

  /** 企业微信事件回调（POST）：处理完成后返回空串即成功 */
  @Post("webhook/wecom")
  @Public()
  async wecomInbound(
    @Req() req: Request,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    try {
      const raw = this.rawBodyOf(req);
      await this.remoteService.handleWecomInbound(raw ?? req.body ?? {}, {
        msgSignature: query.msg_signature,
        timestamp: query.timestamp,
        nonce: query.nonce,
      });
    } catch (err) {
      console.error(`[remote:wecom-webhook] ${(err as Error).message}`);
    }
    res.status(200).send("");
  }
}
