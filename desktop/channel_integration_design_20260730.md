# 外部渠道对接设计文档 — 输入端 + 发布端

> 生成时间：2026-07-30 01:45
> 需求：桌面端增加外部对接口（微信/飞书机器人等输入端，抖音/小红书等发布端）

---

## 1. 需求分析

### 1.1 输入端（接收消息）
用户通过外部平台发消息 → 桌面端 Agent 接收并处理 → 回复到原平台

| 平台 | 类型 | 接入方式 |
|------|------|---------|
| 微信公众号 | 输入 | 微信公众号 API（消息回调） |
| 微信客服/企业微信 | 输入 | 企业微信应用消息回调 |
| 飞书机器人 | 输入 | 飞书事件订阅（IM消息事件） |
| 钉钉机器人 | 输入 | 钉钉群机器人 / 企业内部应用 |
| Telegram Bot | 输入 | Telegram Bot API（Webhook/Polling） |

### 1.2 发布端（推送内容）
桌面端 Agent 生成内容 → 自动发布到外部平台

| 平台 | 类型 | 接入方式 |
|------|------|---------|
| 抖音 | 发布 | 抖音开放平台 API（视频发布） |
| 小红书 | 发布 | 小红书开放平台 API（笔记发布） |
| 微信公众号 | 发布 | 公众号 API（图文素材发布） |
| 微博 | 发布 | 微博开放平台 API（微博发布） |
| 知乎 | 发布 | 知乎 API（文章/回答发布） |
| B站 | 发布 | B站开放平台 API（视频/动态发布） |

### 1.3 核心原则
- **统一架构**：输入端和发布端用同一套渠道管理框架
- **MCP 优先**：每个平台封装为 MCP 工具，通过 MCP 总线调用
- **团队联动**：可指定团队中的某个Agent处理特定渠道的消息
- **自动化**：支持 N8N 工作流编排发布流程（定时发布、多平台同步发布等）

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│                    桌面端                             │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ 微信公众号 │  │ 飞书机器人 │  │ Telegram  │  输入端   │
│  │  Bot A    │  │  Bot B    │  │  Bot C    │           │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
│       │              │              │                  │
│       ▼              ▼              ▼                  │
│  ┌─────────────────────────────────────┐              │
│  │        Channel Gateway              │  统一渠道网关  │
│  │  (消息路由 / 鉴权 / 会话管理)        │              │
│  └──────────────┬──────────────────────┘              │
│                 │                                      │
│     ┌───────────┼───────────┐                         │
│     ▼           ▼           ▼                         │
│  ┌──────┐  ┌────────┐  ┌─────────┐                   │
│  │ Team │  │ Chat   │  │ Hermes  │  处理层             │
│  │ Agent│  │ Service│  │ 编排    │                    │
│  └──────┘  └────────┘  └─────────┘                   │
│     │           │           │                         │
│     ▼           ▼           ▼                         │
│  ┌─────────────────────────────────────┐              │
│  │        MCP Tool Bus                 │  能力总线     │
│  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌──────┐ │              │
│  │  │抖音 │ │小红书│ │微博  │ │公众号 │ │  发布端      │
│  │  │发布 │ │发布 │ │发布 │ │发布  │ │              │
│  │  └─────┘ └─────┘ └─────┘ └──────┘ │              │
│  └─────────────────────────────────────┘              │
│                                                       │
│  ┌─────────────────────────────────────┐              │
│  │        N8N Workflow Engine          │  自动化编排   │
│  │  (定时发布 / 多平台同步 / 内容审核)  │              │
│  └─────────────────────────────────────┘              │
└─────────────────────────────────────────────────────┘
```

### 2.2 与现有模块的关系

```
Channel Gateway (新)
  ├── 输入端消息 → ChatService（复用现有聊天能力）
  ├── 输入端消息 → Team Agent（指定团队处理）
  ├── 发布端调用 → MCP Service（复用现有MCP总线）
  └── 自动化编排 → N8N Service（复用现有工作流引擎）
```

**关键设计：不重新造轮子**
- 输入端消息复用 ChatService 的会话管理和流式回复
- 发布端封装为 MCP 工具，复用 MCP Service 的 callTool
- 自动化发布复用 N8N 工作流引擎

---

## 3. 数据模型

### 3.1 渠道实体

```typescript
@Entity('channels')
export class ChannelEntity extends BaseEntity {
  @Column({ length: 64 })
  name: string;                    // 渠道名称，如 "微信公众号-营销号"

  /** 渠道类型 */
  @Column({
    type: 'enum',
    enum: [
      // 输入端
      'wechat_official',    // 微信公众号
      'wechat_work',        // 企业微信
      'feishu_bot',         // 飞书机器人
      'dingtalk_bot',       // 钉钉机器人
      'telegram_bot',       // Telegram Bot
      // 发布端
      'douyin',             // 抖音
      'xiaohongshu',        // 小红书
      'weibo',              // 微博
      'zhihu',              // 知乎
      'bilibili',           // B站
      // 双向
      'wechat_official_bidirectional', // 微信公众号（同时收发）
    ],
  })
  type: string;

  /** 方向 */
  @Column({
    type: 'enum',
    enum: ['inbound', 'outbound', 'bidirectional'],
    default: 'inbound',
  })
  direction: 'inbound' | 'outbound' | 'bidirectional';

  /** 关联的 Agent ID（处理此渠道消息的Agent） */
  @Column({ name: 'agent_id', type: 'bigint', nullable: true })
  agentId?: number;

  /** 关联的团队 ID（处理此渠道消息的团队） */
  @Column({ name: 'team_id', type: 'bigint', nullable: true })
  teamId?: number;

  /** 凭证配置（加密存储） */
  @Column({ name: 'credentials', type: 'json', nullable: true })
  credentials?: {
    // 微信公众号
    appId?: string;
    appSecret?: string;
    token?: string;          // 消息校验token
    encodingAESKey?: string; // 消息加解密密钥

    // 飞书
    feishuAppId?: string;
    feishuAppSecret?: string;
    feishuVerificationToken?: string;

    // 钉钉
    dingtalkAppKey?: string;
    dingtalkAppSecret?: string;

    // Telegram
    telegramBotToken?: string;

    // 抖音
    douyinClientKey?: string;
    douyinClientSecret?: string;
    douyinAccessToken?: string;

    // 小红书
    xhsAppId?: string;
    xhsAppSecret?: string;

    // 微博
    weiboAccessToken?: string;

    // 通用
    webhookUrl?: string;     // Webhook 回调地址
    apiKey?: string;
  };

  /** Webhook 验证状态 */
  @Column({ name: 'webhook_verified', type: 'boolean', default: false })
  webhookVerified: boolean;

  /** 启用状态 */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** 最后消息时间 */
  @Column({ name: 'last_message_at', type: 'datetime', nullable: true })
  lastMessageAt?: Date;

  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;
}
```

### 3.2 消息记录实体

```typescript
@Entity('channel_messages')
export class ChannelMessageEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index('idx_channel_msg_channel')
  @Column({ name: 'channel_id', type: 'bigint' })
  channelId: number;

  /** 外部平台消息ID */
  @Index('idx_channel_msg_external')
  @Column({ name: 'external_msg_id', length: 128 })
  externalMsgId: string;

  /** 消息方向 */
  @Column({
    type: 'enum',
    enum: ['inbound', 'outbound'],
  })
  direction: 'inbound' | 'outbound';

  /** 消息类型 */
  @Column({
    type: 'enum',
    enum: ['text', 'image', 'video', 'link', 'file', 'voice', 'article'],
    default: 'text',
  })
  messageType: 'text' | 'image' | 'video' | 'link' | 'file' | 'voice' | 'article';

  /** 消息内容 */
  @Column({ type: 'text' })
  content: string;

  /** 发送者信息（外部平台用户） */
  @Column({ name: 'sender_external_id', length: 128, nullable: true })
  senderExternalId?: string;

  @Column({ name: 'sender_name', length: 64, nullable: true })
  senderName?: string;

  @Column({ name: 'sender_avatar', length: 512, nullable: true })
  senderAvatar?: string;

  /** 接收者信息（发布端：目标平台账号） */
  @Column({ name: 'recipient_external_id', length: 128, nullable: true })
  recipientExternalId?: string;

  /** 关联的 ChatSession ID（输入端消息映射到聊天会话） */
  @Column({ name: 'chat_session_id', type: 'bigint', nullable: true })
  chatSessionId?: number;

  /** 关联的团队任务 ID */
  @Column({ name: 'team_task_id', type: 'bigint', nullable: true })
  teamTaskId?: number;

  /** 消息状态 */
  @Column({
    type: 'enum',
    enum: ['pending', 'processing', 'sent', 'delivered', 'failed', 'read'],
    default: 'pending',
  })
  status: 'pending' | 'processing' | 'sent' | 'delivered' | 'failed' | 'read';

  /** 错误信息 */
  @Column({ name: 'error_message', length: 512, nullable: true })
  errorMessage?: string;

  /** 平台原始数据（JSON） */
  @Column({ name: 'raw_payload', type: 'json', nullable: true })
  rawPayload?: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

### 3.3 发布计划实体

```typescript
@Entity('publish_plans')
export class PublishPlanEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Column({ length: 128 })
  title: string;                   // 发布计划名称

  /** 发布内容类型 */
  @Column({
    type: 'enum',
    enum: ['text', 'image', 'video', 'article'],
  })
  contentType: 'text' | 'image' | 'video' | 'article';

  /** 内容（文本/Markdown） */
  @Column({ type: 'text' })
  content: string;

  /** 媒体附件URL列表 */
  @Column({ name: 'media_urls', type: 'json', nullable: true })
  mediaUrls?: string[];

  /** 目标渠道ID列表（多平台同步发布） */
  @Column({ name: 'target_channel_ids', type: 'json' })
  targetChannelIds: number[];

  /** 发布模式 */
  @Column({
    type: 'enum',
    enum: ['immediate', 'scheduled', 'recurring'],
    default: 'immediate',
  })
  publishMode: 'immediate' | 'scheduled' | 'recurring';

  /** 定时发布时间 */
  @Column({ name: 'scheduled_at', type: 'datetime', nullable: true })
  scheduledAt?: Date;

  /** 循环规则（cron 表达式） */
  @Column({ name: 'cron_expr', length: 64, nullable: true })
  cronExpr?: string;

  /** 关联的团队 ID（由团队Agent生成内容） */
  @Column({ name: 'team_id', type: 'bigint', nullable: true })
  teamId?: number;

  /** 关联的 N8N 工作流 ID */
  @Column({ name: 'workflow_id', type: 'bigint', nullable: true })
  workflowId?: number;

  /** 状态 */
  @Column({
    type: 'enum',
    enum: ['draft', 'pending', 'publishing', 'published', 'partial_failed', 'failed', 'cancelled'],
    default: 'draft',
  })
  status: 'draft' | 'pending' | 'publishing' | 'published' | 'partial_failed' | 'failed' | 'cancelled';

  /** 发布结果（每个渠道的结果） */
  @Column({ name: 'publish_results', type: 'json', nullable: true })
  publishResults?: Array<{
    channelId: number;
    channelName: string;
    status: 'success' | 'failed';
    externalPostId?: string;
    externalUrl?: string;
    error?: string;
    publishedAt?: Date;
  }>;

  /** 内容审核状态 */
  @Column({
    type: 'enum',
    enum: ['pending', 'approved', 'rejected', 'auto'],
    default: 'auto',
  })
  reviewStatus: 'pending' | 'approved' | 'rejected' | 'auto';

  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt?: Date;
}
```

---

## 4. 后端模块设计

### 4.1 模块结构

```
backend/src/modules/channel/
├── channel.module.ts
├── controllers/
│   ├── channel.controller.ts          # 渠道管理 CRUD
│   ├── channel-webhook.controller.ts  # Webhook 接收端（外部平台回调）
│   └── publish.controller.ts          # 发布计划 CRUD
├── services/
│   channel.service.ts                 # 渠道管理
│   channel-router.service.ts          # 消息路由（输入端→Chat/Team）
│   publish.service.ts                 # 发布编排
│   └── adapters/                      # 平台适配器
│       ├── wechat-official.adapter.ts
│       ├── feishu.adapter.ts
│       ├── dingtalk.adapter.ts
│       ├── telegram.adapter.ts
│       ├── douyin.adapter.ts
│       ├── xiaohongshu.adapter.ts
│       ├── weibo.adapter.ts
│       └── base.adapter.ts            # 适配器基类
├── entities/
│   ├── channel.entity.ts
│   ├── channel-message.entity.ts
│   └── publish-plan.entity.ts
└── dto/
    └── channel.dto.ts
```

### 4.2 适配器基类

```typescript
// base.adapter.ts
export interface InboundMessage {
  externalMsgId: string;
  senderExternalId: string;
  senderName?: string;
  senderAvatar?: string;
  messageType: 'text' | 'image' | 'video' | 'link' | 'file' | 'voice';
  content: string;
  mediaUrls?: string[];
  rawPayload: any;
}

export interface OutboundResult {
  success: boolean;
  externalPostId?: string;
  externalUrl?: string;
  error?: string;
}

export abstract class BaseChannelAdapter {
  constructor(
    protected readonly credentials: ChannelCredentials,
  ) {}

  /** 验证 Webhook 签名（输入端） */
  abstract verifyWebhook(headers: Record<string, string>, body: string, query: Record<string, string>): boolean;

  /** 解析入站消息 */
  abstract parseInboundMessage(body: any, headers: Record<string, string>): InboundMessage;

  /** 发送消息（输出端，回复到外部平台） */
  abstract sendMessage(to: string, content: string, mediaUrls?: string[]): Promise<OutboundResult>;

  /** 发布内容（发布端） */
  abstract publishContent(content: string, mediaUrls?: string[], options?: PublishOptions): Promise<OutboundResult>;

  /** 获取平台用户信息 */
  abstract getUserInfo(externalUserId: string): Promise<{ name: string; avatar?: string }>;
}
```

### 4.3 平台适配器示例

```typescript
// wechat-official.adapter.ts
export class WechatOfficialAdapter extends BaseChannelAdapter {
  verifyWebhook(headers, body, query): boolean {
    const { signature, timestamp, nonce } = query;
    const token = this.credentials.token;
    const arr = [token, timestamp, nonce].sort();
    const sha1 = crypto.createHash('sha1').update(arr.join('')).digest('hex');
    return sha1 === signature;
  }

  parseInboundMessage(body): InboundMessage {
    const msg = body.xml || body;
    return {
      externalMsgId: msg.msgid,
      senderExternalId: msg.fromusername,
      senderName: msg.fromusername,
      messageType: this.mapMsgType(msg.msgtype),
      content: msg.content,
      rawPayload: body,
    };
  }

  async sendMessage(to: string, content: string): Promise<OutboundResult> {
    // 调用微信公众号客服消息 API
    const accessToken = await this.getAccessToken();
    const resp = await fetch(
      `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          touser: to,
          msgtype: 'text',
          text: { content },
        }),
      },
    );
    const data = await resp.json();
    return { success: data.errcode === 0, error: data.errmsg };
  }

  async publishContent(content: string, mediaUrls?: string[]): Promise<OutboundResult> {
    // 调用微信公众号素材发布 API
    // 1. 上传图文素材 → 2. 发布
    // ...
  }

  private async getAccessToken(): Promise<string> {
    // 缓存 access_token（2小时有效）
    // ...
  }
}
```

```typescript
// douyin.adapter.ts
export class DouyinAdapter extends BaseChannelAdapter {
  verifyWebhook(): boolean {
    return true; // 抖音发布端不需要Webhook验证
  }

  parseInboundMessage(): InboundMessage {
    throw new Error('Douyin is outbound only');
  }

  async publishContent(content: string, mediaUrls: string[], options?: PublishOptions): Promise<OutboundResult> {
    // 1. 上传视频
    const uploadResp = await this.uploadVideo(mediaUrls[0]);
    // 2. 创建图文/视频帖子
    const publishResp = await this.createPost({
      videoId: uploadResp.videoId,
      text: content,
      coverUrl: options?.coverUrl,
    });
    return {
      success: publishResp.code === 0,
      externalPostId: publishResp.data.item_id,
      externalUrl: `https://www.douyin.com/video/${publishResp.data.item_id}`,
    };
  }

  private async uploadVideo(videoUrl: string) {
    // 调用抖音开放平台视频上传API
    // ...
  }

  private async createPost(params: any) {
    // 调用抖音开放平台视频发布API
    // ...
  }
}
```

### 4.4 消息路由服务

```typescript
// channel-router.service.ts
@Injectable()
export class ChannelRouterService {
  constructor(
    private readonly chatService: ChatService,
    private readonly syncGateway: SyncGateway,
  ) {}

  /**
   * 处理入站消息
   * 1. 查找渠道配置
   * 2. 路由到对应的处理方（Chat/Team Agent）
   * 3. 将回复发送回外部平台
   */
  async handleInboundMessage(channelId: number, message: InboundMessage): Promise<void> {
    // 1. 保存消息记录
    const record = await this.saveMessage(channelId, message, 'inbound');

    // 2. 推送到前端（WebSocket 实时通知）
    this.syncGateway.pushToUser(channel.userId, 'channel:message', {
      channelId, message: record,
    });

    // 3. 路由到 ChatService（复用现有聊天能力）
    const session = await this.chatService.findOrCreateChannelSession(
      channel.userId, channelId, message.senderExternalId,
    );

    // 4. 通过 ChatService 处理消息
    const response = await this.chatService.processMessage(
      session.id, message.content, session.userId,
    );

    // 5. 将回复发送回外部平台
    const adapter = this.getAdapter(channel);
    await adapter.sendMessage(message.senderExternalId, response.text);

    // 6. 保存回复消息记录
    await this.saveMessage(channelId, {
      externalMsgId: `reply-${Date.now()}`,
      content: response.text,
      messageType: 'text',
    }, 'outbound');

    // 7. 推送回复到前端
    this.syncGateway.pushToUser(channel.userId, 'channel:reply', {
      channelId, reply: response.text,
    });
  }
}
```

### 4.5 发布编排服务

```typescript
// publish.service.ts
@Injectable()
export class PublishService {
  constructor(
    private readonly channelRepo: Repository<ChannelEntity>,
    private readonly planRepo: Repository<PublishPlanEntity>,
  ) {}

  /**
   * 执行发布计划
   * 支持多平台同步发布
   */
  async executePlan(planId: number): Promise<void> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('发布计划不存在');

    // 更新状态为发布中
    plan.status = 'publishing';
    await this.planRepo.save(plan);

    const results: PublishResult[] = [];

    // 遍历目标渠道，逐个发布
    for (const channelId of plan.targetChannelIds) {
      const channel = await this.channelRepo.findOne({ where: { id: channelId } });
      if (!channel) {
        results.push({ channelId, status: 'failed', error: '渠道不存在' });
        continue;
      }

      try {
        const adapter = this.getAdapter(channel);
        const result = await adapter.publishContent(
          plan.content,
          plan.mediaUrls,
        );
        results.push({
          channelId,
          channelName: channel.name,
          status: result.success ? 'success' : 'failed',
          externalPostId: result.externalPostId,
          externalUrl: result.externalUrl,
          error: result.error,
          publishedAt: new Date(),
        });
      } catch (err) {
        results.push({
          channelId, channelName: channel.name,
          status: 'failed', error: err.message,
        });
      }
    }

    // 更新发布结果
    plan.publishResults = results;
    plan.status = results.every(r => r.status === 'success') ? 'published'
      : results.every(r => r.status === 'failed') ? 'failed'
      : 'partial_failed';
    await this.planRepo.save(plan);

    // WebSocket 通知前端
    this.syncGateway.pushToUser(plan.userId, 'publish:completed', {
      planId: plan.id, status: plan.status, results,
    });
  }

  /**
   * 定时发布（由 cron 触发）
   */
  async executeScheduledPlans(): Promise<void> {
    const now = new Date();
    const plans = await this.planRepo.find({
      where: { publishMode: 'scheduled', status: 'pending' },
    });

    for (const plan of plans) {
      if (plan.scheduledAt && plan.scheduledAt <= now) {
        await this.executePlan(plan.id);
      }
    }
  }
}
```

---

## 5. API 设计

### 5.1 渠道管理

```
# 渠道 CRUD
GET    /api/channels                   渠道列表（支持按方向/类型筛选）
POST   /api/channels                   创建渠道（配置凭证）
GET    /api/channels/:id               渠道详情
PATCH  /api/channels/:id               更新渠道
DELETE /api/channels/:id               删除渠道
POST   /api/channels/:id/verify        验证Webhook
POST   /api/channels/:id/test          发送测试消息

# Webhook 接收端（无需鉴权，由平台签名验证）
GET    /api/channels/webhook/:channelId   Webhook验证（微信等GET验证）
POST   /api/channels/webhook/:channelId   Webhook消息接收

# 消息记录
GET    /api/channels/:id/messages      消息记录列表
```

### 5.2 发布管理

```
# 发布计划 CRUD
GET    /api/publish/plans              发布计划列表
POST   /api/publish/plans              创建发布计划
GET    /api/publish/plans/:id          发布计划详情
PATCH  /api/publish/plans/:id          更新发布计划
DELETE /api/publish/plans/:id          删除发布计划
POST   /api/publish/plans/:id/execute  立即执行发布
POST   /api/publish/plans/:id/cancel   取消发布

# 内容生成（AI辅助）
POST   /api/publish/generate           AI生成发布内容
POST   /api/publish/preview            预览发布效果
```

---

## 6. 前端页面设计

### 6.1 页面结构

```
侧边栏新增「渠道」菜单项：
├── 📡 渠道管理 (/channels)
│   ├── 渠道列表
│   ├── 创建渠道（选择平台 → 配置凭证 → 测试）
│   └── 消息记录
├── 📢 内容发布 (/publish)
│   ├── 发布计划列表
│   ├── 创建发布（选择平台 → 编辑内容 → 定时/立即）
│   └── 发布历史
```

### 6.2 渠道管理页

**渠道列表：**
```
┌─────────────────────────────────────────────────────┐
│  📡 渠道管理                           [+ 添加渠道]  │
├─────────────────────────────────────────────────────┤
│  筛选: [全部] [输入端] [发布端] [双向]               │
│                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ 💬 微信   │ │ 🐦 飞书   │ │ 📱 抖音   │            │
│  │ 公众号    │ │ 机器人    │ │ 发布号    │            │
│  │ 输入端    │ │ 输入端    │ │ 发布端    │            │
│  │ ✅ 已验证  │ │ ✅ 已验证  │ │ ⚠ 未测试  │            │
│  │ [设置][删除]│ │ [设置][删除]│ │ [设置][删除]│           │
│  └──────────┘ └──────────┘ └──────────┘            │
└─────────────────────────────────────────────────────┘
```

**创建渠道弹窗（分步）：**
```
步骤1: 选择平台
  ┌─────────────────────────────────┐
  │  选择渠道类型                    │
  │                                  │
  │  输入端:                         │
  │  [💬 微信公众号] [🐦 飞书机器人]   │
  │  [🔔 钉钉机器人] [✈️ Telegram]   │
  │                                  │
  │  发布端:                         │
  │  [📱 抖音] [📕 小红书]            │
  │  [🌐 微博] [📚 知乎] [📺 B站]    │
  └─────────────────────────────────┘

步骤2: 配置凭证
  ┌─────────────────────────────────┐
  │  微信公众号配置                   │
  │                                  │
  │  AppID:    [________________]    │
  │  AppSecret:[________________]    │
  │  Token:    [________________]    │
  │  AESKey:   [________________]    │
  │                                  │
  │  Webhook URL:                    │
  │  https://api.shentong.ai/api/    │
  │  channels/webhook/123            │
  │  [复制]                          │
  │                                  │
  │  关联Agent: [选择Agent ▼]        │
  │  关联团队: [选择团队 ▼] (可选)    │
  └─────────────────────────────────┘

步骤3: 测试连接
  ┌─────────────────────────────────┐
  │  ✅ Webhook 验证通过             │
  │  ✅ 凭证有效                     │
  │  ✅ 测试消息发送成功              │
  │                                  │
  │         [完成创建]                │
  └─────────────────────────────────┘
```

### 6.3 内容发布页

**发布计划列表：**
```
┌─────────────────────────────────────────────────────┐
│  📢 内容发布                          [+ 创建发布]   │
├─────────────────────────────────────────────────────┤
│  筛选: [全部] [草稿] [待发布] [已发布] [失败]        │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ 📱 抖音 · 产品宣传视频                        │   │
│  │ 内容: "AI办公新方式..."                       │   │
│  │ 平台: 抖音 + 小红书 + B站 (3个平台)           │   │
│  │ 状态: ✅ 已发布 | 2024-07-30 10:00           │   │
│  │ [查看详情] [重新发布]                         │   │
│  ├──────────────────────────────────────────────┤   │
│  │ 📕 小红书 · 种草笔记                          │   │
│  │ 内容: "今天发现一个超好用的..."                │   │
│  │ 平台: 小红书                                  │   │
│  │ 状态: ⏳ 待发布 | 定时 2024-07-31 14:00       │   │
│  │ [编辑] [立即发布] [取消]                      │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**创建发布弹窗：**
```
┌─────────────────────────────────────────────────────┐
│  创建发布                                            │
├─────────────────────────────────────────────────────┤
│  发布到:  [✅ 抖音] [✅ 小红书] [☐ 微博] [☐ B站]    │
│                                                      │
│  内容类型: [📝 文字] [🖼️ 图文] [🎥 视频] [📄 文章] │
│                                                      │
│  标题: [________________________]                    │
│                                                      │
│  内容:                                               │
│  ┌──────────────────────────────────────────┐       │
│  │  在这里输入发布内容...                     │       │
│  │                                            │       │
│  └──────────────────────────────────────────┘       │
│  [✨ AI生成内容]  [📋 从模板选择]                    │
│                                                      │
│  媒体:  [📎 上传]  video_001.mp4                     │
│                                                      │
│  发布模式: [立即发布] [定时发布] [循环发布]          │
│  定时时间: [2024-07-31 14:00 📅]                    │
│                                                      │
│  审核: [自动发布] [需人工审核]                       │
│                                                      │
│              [取消]  [保存草稿]  [发布]               │
└─────────────────────────────────────────────────────┘
```

### 6.4 侧边栏更新

```typescript
// Sidebar NAV_GROUPS 更新
const NAV_GROUPS: NavGroup[] = [
  {
    title: 'AI 办公区',
    items: [
      { key: 'dashboard', label: '仪表盘', icon: '📊', path: '/dashboard' },
      { key: 'office', label: 'AI 办公室', icon: '🏢', path: '/office' },
      { key: 'chat', label: '对话', icon: '💬', path: '/chat' },
      { key: 'automation', label: '自动化', icon: '⚡', path: '/automation' },
    ],
  },
  {
    title: '工作区',
    items: [
      { key: 'hermes', label: 'Hermes', icon: '🧩', path: '/hermes' },
      { key: 'plugins', label: '插件', icon: '🔌', path: '/plugins' },
      { key: 'knowledge', label: '知识库', icon: '📚', path: '/knowledge' },
      { key: 'team', label: '团队', icon: '👥', path: '/team' },
    ],
  },
  {
    title: '渠道中心',           // ← 新增分组
    items: [
      { key: 'channels', label: '渠道管理', icon: '📡', path: '/channels' },
      { key: 'publish', label: '内容发布', icon: '📢', path: '/publish' },
    ],
  },
  {
    title: '资源区',
    items: [
      { key: 'agent-market', label: '智能体市场', icon: '🤖', path: '/agent-market' },
      { key: 'workflows', label: '工作流', icon: '📋', path: '/workflows' },
      { key: 'credits', label: '积分', icon: '💎', path: '/credits' },
    ],
  },
  {
    title: '设置区',
    items: [
      { key: 'settings', label: '设置', icon: '⚙️', path: '/settings' },
      { key: 'services', label: '服务', icon: '🔧', path: '/services' },
    ],
  },
];
```

---

## 7. MCP 工具封装

每个发布端平台封装为 MCP 工具，供 Agent 和工作流调用：

```typescript
// MCP 工具注册（发布端）
const PUBLISH_TOOLS = [
  {
    name: 'publish_douyin',
    description: '发布视频到抖音',
    inputSchema: {
      type: 'object',
      properties: {
        videoUrl: { type: 'string', description: '视频URL' },
        title: { type: 'string', description: '视频标题' },
        coverUrl: { type: 'string', description: '封面图URL' },
        tags: { type: 'array', items: { type: 'string' }, description: '话题标签' },
      },
      required: ['videoUrl', 'title'],
    },
  },
  {
    name: 'publish_xiaohongshu',
    description: '发布笔记到小红书',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '笔记标题' },
        content: { type: 'string', description: '笔记正文' },
        imageUrls: { type: 'array', items: { type: 'string' }, description: '图片URL列表' },
        tags: { type: 'array', items: { type: 'string' }, description: '话题标签' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'publish_weibo',
    description: '发布微博',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '微博正文' },
        imageUrls: { type: 'array', items: { type: 'string' }, description: '配图URL列表' },
      },
      required: ['content'],
    },
  },
  {
    name: 'publish_wechat_article',
    description: '发布微信公众号图文',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '文章标题' },
        content: { type: 'string', description: '文章内容（HTML）' },
        coverUrl: { type: 'string', description: '封面图URL' },
        digest: { type: 'string', description: '摘要' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'publish_bilibili',
    description: '发布B站视频/动态',
    inputSchema: {
      type: 'object',
      properties: {
        videoUrl: { type: 'string', description: '视频URL' },
        title: { type: 'string', description: '视频标题' },
        description: { type: 'string', description: '视频简介' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签' },
        type: { type: 'string', enum: ['video', 'dynamic'], description: '视频或动态' },
      },
      required: ['title', 'type'],
    },
  },
];
```

---

## 8. 与团队模块的联动

### 8.1 渠道绑定团队

```typescript
// 渠道可绑定团队，入站消息由团队协作处理
channel.teamId = team.id;

// ChannelRouterService 路由逻辑
if (channel.teamId) {
  // 1. 调用团队编排接口
  const result = await this.hermesService.orchestrateTask(
    channel.userId, channel.teamId, { message: inboundMessage.content },
  );
  // 2. 将团队回复发送回外部平台
  await adapter.sendMessage(inboundMessage.senderExternalId, result.text);
} else if (channel.agentId) {
  // 单 Agent 处理
  const session = await this.chatService.findOrCreateChannelSession(...);
  const response = await this.chatService.processMessage(...);
  await adapter.sendMessage(..., response.text);
}
```

### 8.2 团队Agent生成发布内容

```
用户: "帮我写一篇小红书种草笔记，推我们的AI办公产品"
  ↓
Hermes 编排:
  1. 内容AI → 撰写种草文案
  2. 客服AI → 生成话题标签
  3. 财务AI → 审核内容合规性
  ↓
发布计划:
  渠道: 小红书
  内容: "今天发现一个超好用的AI办公工具..."
  标签: #AI办公 #效率工具 #打工人必备
  状态: 待审核 → 审核通过 → 已发布
```

---

## 9. 实现顺序

| 步骤 | 内容 | 工作量 | 依赖 |
|------|------|--------|------|
| 1 | 后端实体 + Channel Module 骨架 | 1天 | 无 |
| 2 | BaseAdapter + 微信/飞书适配器 | 2天 | 步骤1 |
| 3 | Webhook 接收 + 消息路由 | 1天 | 步骤2 |
| 4 | 抖音/小红书发布适配器 | 2天 | 步骤1 |
| 5 | 发布计划 Service + 定时发布 | 1天 | 步骤4 |
| 6 | MCP 工具注册（发布端） | 0.5天 | 步骤4 |
| 7 | 前端渠道管理页 | 1.5天 | 步骤1-3 |
| 8 | 前端内容发布页 | 1.5天 | 步骤5-6 |
| 9 | 侧边栏 + 路由更新 | 0.5天 | 步骤7-8 |
| 10 | 钉钉/Telegram/微博/B站/知乎适配器 | 3天 | 步骤2 |
| 11 | 团队联动 + AI内容生成 | 1天 | 步骤3+5+团队模块 |
| 12 | 测试 + 验证 | 2天 | 全部 |
| **合计** | | **17天** | |

### 优先级
- **P0（先做）**: 微信公众号(输入) + 抖音(发布) + 小红书(发布)
- **P1（跟进）**: 飞书(输入) + 微博(发布) + B站(发布)
- **P2（后续）**: 钉钉 + Telegram + 知乎 + 企业微信

---

## 10. 安全与合规

1. **凭证加密存储** — credentials 字段使用 AES-256 加密
2. **Webhook 签名验证** — 每个平台的消息回调必须验证签名
3. **内容审核** — 发布前可选人工审核 / AI自动审核
4. **频率限制** — 防止API调用频率超限（各平台限制不同）
5. **access_token 缓存** — 各平台的 token 有效期不同，统一缓存管理
6. **错误重试** — 发布失败自动重试3次，间隔递增（1s/5s/30s）

---

## 11. 风险与注意事项

1. **平台API限制** — 抖音/小红书的开放平台API有严格审核流程，需要企业资质
2. **微信被动回复限制** — 公众号被动回复有5秒超时限制，长回复需要用客服消息异步发送
3. **飞书事件订阅** — 需要公网可访问的Webhook地址，本地开发需内网穿透
4. **抖音视频发布** — 需要先上传视频到抖音CDN，再创建发布任务，是两步操作
5. **小红书API** — 小红书开放平台API目前较封闭，可能需要爬虫方案替代
6. **多平台内容适配** — 同一内容在不同平台格式不同（抖音要视频，小红书要图文，微博要短文），需要内容适配层
