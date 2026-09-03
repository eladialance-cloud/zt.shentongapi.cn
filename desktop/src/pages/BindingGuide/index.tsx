// 绑定引导页（D5）：扫码/渠道绑定引导 —— 设备确认 → IM 绑定 → 场景配置
// 复用现有渠道管理/自动化 API，不新增后端接口；三步向导帮助用户快速跑通"手机遥控电脑"闭环
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert, Button, Card, Empty, List, Result, Spin, Steps, Tag, message,
} from "antd";
import {
  CheckCircleOutlined, LaptopOutlined, LinkOutlined, ThunderboltOutlined,
} from "@ant-design/icons";
import * as channelApi from "@/api/channel-api";
import * as automationApi from "@/api/automation-api";
import type { Channel } from "@/types/channel";
import type { AutomationTemplate } from "@/types/automation";
import styles from "../Team/styles.module.css";

const PLATFORM_LABELS: Record<string, string> = {
  feishu_bot: "飞书机器人",
  wechat_mp: "微信公众号",
  wechat_work: "企业微信",
  dingtalk_bot: "钉钉机器人",
  telegram_bot: "Telegram",
};

export default function BindingGuide() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [fingerprint, setFingerprint] = useState("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [templates, setTemplates] = useState<AutomationTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fp, chs, tpls] = await Promise.all([
        (window as any).api?.device?.getFingerprint?.() ?? Promise.resolve(""),
        channelApi.listChannels(),
        automationApi.listTemplates(),
      ]);
      setFingerprint(String(fp ?? ""));
      setChannels(chs || []);
      setTemplates(tpls || []);
    } catch (err) {
      message.error("加载引导数据失败: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const boundIm = channels.filter((c) => c.status === "active" && c.platform !== "wechat_mp");
  const shortFp = fingerprint.length > 16 ? `${fingerprint.slice(0, 8)}…${fingerprint.slice(-8)}` : fingerprint;

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <span className={styles.pageTitleIcon}><LinkOutlined /></span>
          <span>绑定引导</span>
        </div>
      </div>

      <Card bordered={false} style={{ marginBottom: 16 }}>
        <Steps
          current={step}
          onChange={setStep}
          items={[
            { title: "确认设备", icon: <LaptopOutlined /> },
            { title: "绑定 IM", icon: <LinkOutlined /> },
            { title: "配置场景", icon: <ThunderboltOutlined /> },
          ]}
        />
      </Card>

      <Spin spinning={loading}>
        {step === 0 && (
          <Card bordered={false} title="第一步：确认本机设备">
            <Result
              icon={<LaptopOutlined style={{ color: "#4F6EF7" }} />}
              title="本机即执行器"
              subTitle="云端会把 IM 指令推送到这台电脑执行；保持桌面端登录并常驻即可。开机自启已自动开启。"
              extra={[
                <Button key="next" type="primary" onClick={() => setStep(1)}>下一步：绑定 IM</Button>,
              ]}
            />
            <Alert
              type="info"
              showIcon
              message={`设备指纹：${shortFp || "获取中…"}（每条指令都会校验本设备归属）`}
              style={{ maxWidth: 640, margin: "0 auto" }}
            />
          </Card>
        )}

        {step === 1 && (
          <Card
            bordered={false}
            title="第二步：绑定 IM（手机遥控入口）"
            extra={<Button onClick={() => navigate("/channels")}>去渠道管理</Button>}
          >
            {boundIm.length === 0 ? (
              <Empty description="尚未绑定任何 IM 渠道">
                <Button type="primary" onClick={() => navigate("/channels")}>立即添加渠道</Button>
              </Empty>
            ) : (
              <List
                dataSource={boundIm}
                renderItem={(c) => (
                  <List.Item>
                    <List.Item.Meta
                      title={`${PLATFORM_LABELS[c.platform] ?? c.platform} · ${c.name}`}
                      description={`方向：${c.direction === "both" ? "双向" : c.direction === "input" ? "入站" : "出站"}`}
                    />
                    <Tag color="green"><CheckCircleOutlined /> 已绑定</Tag>
                  </List.Item>
                )}
              />
            )}
            <Alert
              style={{ marginTop: 16 }}
              type="info"
              showIcon
              message="绑定说明"
              description="飞书：开放平台创建企业自建应用 → 事件订阅填 https://zt.shentongapi.cn/api/remote/webhook/feishu → 渠道管理添加「飞书机器人」，凭证填 AppID/AppSecret。企业微信/公众号同理，回调地址见渠道管理页。"
            />
            <div style={{ marginTop: 16, textAlign: "right" }}>
              <Button onClick={() => setStep(0)} style={{ marginRight: 8 }}>上一步</Button>
              <Button type="primary" onClick={() => setStep(2)}>下一步：配置场景</Button>
            </div>
          </Card>
        )}

        {step === 2 && (
          <Card
            bordered={false}
            title="第三步：配置常用场景（手机发消息即可触发）"
            extra={<Button onClick={() => navigate("/automation")}>去自动化工作台</Button>}
          >
            {templates.length === 0 ? (
              <Empty description="暂无可用场景模板">
                <Button type="primary" onClick={() => navigate("/automation")}>去自动化工作台</Button>
              </Empty>
            ) : (
              <List
                dataSource={templates}
                renderItem={(t) => (
                  <List.Item
                    actions={[
                      <Button key="use" size="small" type="primary" onClick={() => navigate(`/automation?template=${t.id}`)}>
                        创建实例
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={t.name}
                      description={`${t.description ?? ""}${t.keywords ? `（触发词：${t.keywords}）` : ""}`}
                    />
                  </List.Item>
                )}
              />
            )}
            <div style={{ marginTop: 16, textAlign: "right" }}>
              <Button onClick={() => setStep(1)} style={{ marginRight: 8 }}>上一步</Button>
              <Button type="primary" onClick={() => navigate("/automation")}>完成，去测试</Button>
            </div>
          </Card>
        )}
      </Spin>
    </div>
  );
}