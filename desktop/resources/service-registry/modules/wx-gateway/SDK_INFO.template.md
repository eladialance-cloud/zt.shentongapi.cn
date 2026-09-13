# SDK_INFO —— 微信域桥后端选型决策记录

> **结论：采用开源 wxauto（MIT），不购买授权 SDK，无需填写任何授权信息。**
> 文末保留「商业授权兜底模板」，仅当将来改回授权路线时才需要填写。

## 1. 决策

| 项 | 值 |
|---|---|
| 后端 | `wxauto`（开源） |
| 许可证 | MIT |
| 源码 | https://github.com/cluic/wxauto |
| 集成位置 | `wx_driver.py`（本服务唯一与第三方库耦合的文件） |
| 是否需要授权密钥 | 否（不再读取 `WX_LICENSE_KEY`） |
| 是否引入商业闭源内核 | 否（不引入 / 不依赖 / 不复制） |
| 决策日期 | 2026-09-10 |

## 2. 为什么放弃商业授权内核

1. **合规**：商业内核是付费闭源组件，随产品分发需另行取得许可；项目约束要求不复制任何未授权实现。
2. **交付成本**：购买授权会给终端用户增加额外费用与激活步骤（远程服务与内核授权还分别计费）。
3. **风险隔离**：开源后端已覆盖 5 个主用能力；剩余 3 项（加好友 / 朋友圈）恰是最高风控等级，本就计划默认关闭。

## 3. 能力覆盖

| 能力 | 中文名 | 风控 | 后端 | 说明 |
|---|---|---|---|---|
| status | 连接状态 | readonly | open | `wxauto` 入口类 + `GetMyInfo` |
| send | 发消息 | high | open | `SendMsg(msg=..., who=...)` |
| friends | 好友列表 | readonly | open | 方法名见 `wx_driver.FRIENDS_METHODS`（版本差异） |
| group | 群聊消息 | high | open | `ChatWith` 定位会话后 `SendMsg` |
| listen | 监听消息 | readonly | open | `AddListenChat` + `GetListenMessage` |
| add_friend | 添加好友 | high | unavailable | 商业内核增强项 |
| moments | 朋友圈列表 | readonly | unavailable | 商业内核增强项 |
| moments_publish | 发布朋友圈 | high | unavailable | 商业内核增强项 |

## 4. 真机核对清单（上线前必做）

- [ ] `pip install wxauto` 成功，`python -c "import wxauto"` 通过
- [ ] 本机 PC 微信版本落在 wxauto 的适配范围内（版本对不上会直接跑不起来）
- [ ] 核对 `wx_driver.WXAUTO_METHODS` 的入口类与方法名/签名；不一致**只改这张表**
- [ ] 核对 `wx_driver.FRIENDS_METHODS` 实际命中哪个方法
- [ ] 微信已登录，`GET /api/wx/status` 返回 `connected=true`
- [ ] 5 个能力逐个 PoC（`send` / `group` / `listen` 先用小号或测试群）
- [ ] 限频与灰度：群发、监听加间隔（对应 F6 灰度与风控降频）
- [ ] 微信版本升级后回归一次（UI 自动化对版本敏感）

## 5. 商业授权兜底模板（仅在改回授权路线时填写）

若将来确定改回商业授权内核，按下列字段填写后替换 `wx_driver.py`：

| 字段 | 填写 |
|---|---|
| SDK 产品名 / 厂商 |  |
| 版本号 / 授权形式 |  |
| EULA 摘要与链接（是否允许本地集成、随包分发、商用） |  |
| 授权校验方式 |  |
| 安装命令（写入 `requirements.txt`） |  |
| Python / 平台要求 |  |
| 密钥环境变量与读取方式 |  |

> 填写前先确认：不复制任何闭源实现或授权校验逻辑，发布代码内不出现商业品牌 token 与密钥明文。

