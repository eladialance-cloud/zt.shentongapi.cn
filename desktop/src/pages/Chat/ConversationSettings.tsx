// 对话设置抽屉（需求对话重构：收纳原对话页顶部控件）
// 内容：模型选择（后端模型 + 自定义大模型）/ 刷新模型 / Agent / 知识库 / 素材生成入口
// 积分余额不放这里（顶栏已有）。

import { useMemo } from 'react'
import { Button, Drawer, Select, Space, Tooltip } from 'antd'
import type { SelectProps } from 'antd'
import {
  ApiOutlined,
  DatabaseOutlined,
  EditOutlined,
  ExperimentOutlined,
  GlobalOutlined,
  ReloadOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import type { LlmIntegration } from '@shared/types'
import type { ModelOption, AgentOption, KnowledgeBaseOption } from '@/types/chat'
import styles from './styles.module.css'

/** 知识库选择器「全局搜索」的固定 value（页面与抽屉共用） */
export const GLOBAL_KB_VALUE = '__global__'

/** 模型分类分组标签（对话模型下拉） */
const MODEL_TYPE_GROUP_LABEL: Record<string, string> = {
  chat: '文本对话',
  vision: '图片识图',
  reasoning: '推理',
  embedding: '向量',
  audio: '音频',
}

interface ConversationSettingsProps {
  open: boolean
  onClose: () => void
  /** 当前模型 ID */
  modelId: string
  /** 后端启用模型 */
  modelOptions: ModelOption[]
  /** 自定义大模型接入（设置 → 大模型接入） */
  customIntegrations: LlmIntegration[]
  modelLoading: boolean
  agentId?: number
  agentOptions: AgentOption[]
  /** Agent 价格提示文案（由页面计算后传入） */
  agentPriceHint?: string
  knowledgeBaseId?: number
  kbOptions: KnowledgeBaseOption[]
  onModelChange: (id: string) => void
  onRefreshModels: () => void
  onAgentChange: (id?: number) => void
  onKnowledgeBaseChange: (id?: number) => void
  /** 打开文生图/文生视频弹窗 */
  onOpenGeneration: (type: 'image' | 'video') => void
  /** 打开需求模板设置 */
  onOpenDemandTemplate?: () => void
}

export function ConversationSettings({
  open,
  onClose,
  modelId,
  modelOptions,
  customIntegrations,
  modelLoading,
  agentId,
  agentOptions,
  agentPriceHint,
  knowledgeBaseId,
  kbOptions,
  onModelChange,
  onRefreshModels,
  onAgentChange,
  onKnowledgeBaseChange,
  onOpenGeneration,
  onOpenDemandTemplate,
}: ConversationSettingsProps) {
  /** 模型下拉选项（按模型类型分组 + 自定义模型） */
  const modelSelectProps: SelectProps = useMemo(() => {
    const renderOption = (m: ModelOption) => ({
      label: (
        <span>
          <ThunderboltOutlined style={{ color: 'var(--color-text-secondary)', marginRight: 6 }} />
          {m.name}
          {m.provider && (
            <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 6, fontSize: 11 }}>
              ({m.provider})
            </span>
          )}
          {m.modelType && m.modelType !== 'chat' && (
            <span style={{ color: 'var(--color-purple)', marginLeft: 6, fontSize: 11 }}>
              [{m.modelType}]
            </span>
          )}
          {(m.inputPricePer1k != null || m.outputPricePer1k != null) && (
            <span style={{ color: 'var(--color-accent)', marginLeft: 6, fontSize: 11 }}>
              {m.inputPricePer1k ?? 0}/{m.outputPricePer1k ?? 0} 积分/千token
            </span>
          )}
        </span>
      ),
      value: m.id,
    })
    const groupMap = new Map<string, ReturnType<typeof renderOption>[]>()
    for (const m of modelOptions) {
      const key = m.modelType && m.modelType !== 'chat' ? m.modelType : 'chat'
      if (!groupMap.has(key)) groupMap.set(key, [])
      groupMap.get(key)!.push(renderOption(m))
    }
    const options = Array.from(groupMap.entries()).map(([key, items]) => ({
      label: MODEL_TYPE_GROUP_LABEL[key] || key,
      options: items,
    }))
    if (customIntegrations.length > 0) {
      options.push({
        label: '自定义模型',
        options: customIntegrations.flatMap((c) =>
          (c.models || []).map((m) => ({
            label: (
              <span>
                <ApiOutlined style={{ color: 'var(--color-text-secondary)', marginRight: 6 }} />
                {c.name} · {m.name || m.id}
              </span>
            ),
            value: 'custom/' + c.id + '/' + m.id,
          })),
        ),
      })
    }
    return {
      options,
      notFoundContent: modelLoading
        ? '加载中...'
        : '管理后台暂未上线模型，可在「设置 → 大模型接入」添加自定义模型',
    }
  }, [modelOptions, modelLoading, customIntegrations])

  const agentSelectProps: SelectProps = useMemo(
    () => ({
      options: agentOptions.map((a) => ({
        label: (
          <span>
            <RobotOutlined style={{ color: 'var(--color-text-secondary)', marginRight: 6 }} />
            {a.name}
          </span>
        ),
        value: a.id,
      })),
    }),
    [agentOptions],
  )

  const kbSelectProps: SelectProps = useMemo(
    () => ({
      options: [
        {
          label: (
            <span>
              <GlobalOutlined style={{ color: 'var(--color-text-secondary)', marginRight: 6 }} />
              全局搜索（默认）
            </span>
          ),
          value: GLOBAL_KB_VALUE,
        },
        ...kbOptions.map((k) => ({
          label: (
            <span>
              <DatabaseOutlined style={{ color: 'var(--color-text-secondary)', marginRight: 6 }} />
              {k.name}
            </span>
          ),
          value: k.id,
        })),
      ],
    }),
    [kbOptions],
  )

  return (
    <Drawer
      title="对话设置"
      placement="right"
      width={360}
      open={open}
      onClose={onClose}
      destroyOnClose={false}
    >
      {/* 模型选择 */}
      <div className={styles.settingsSection}>
        <div className={styles.settingsLabel}>对话模型</div>
        <div className={styles.settingsRow}>
          <Select
            {...modelSelectProps}
            value={modelId || undefined}
            onChange={onModelChange}
            loading={modelLoading}
            placeholder="选择模型"
            style={{ flex: 1 }}
            popupMatchSelectWidth={false}
            labelRender={({ value }) => {
              const m = modelOptions.find((x) => x.id === value)
              return <span>{m?.name || (value as string)}</span>
            }}
          />
          <Tooltip title="刷新模型列表（同步管理后台最新模型）">
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              loading={modelLoading}
              onClick={onRefreshModels}
            />
          </Tooltip>
        </div>
        <div className={styles.settingsTip}>
          {modelId ? ('当前模型：' + modelId) : '未选择模型，将使用系统默认'}
        </div>
      </div>

      {/* Agent */}
      <div className={styles.settingsSection}>
        <div className={styles.settingsLabel}>Agent（可选）</div>
        <Select
          {...agentSelectProps}
          value={agentId}
          onChange={onAgentChange}
          placeholder="选择 Agent（可选）"
          allowClear
          style={{ width: '100%' }}
          popupMatchSelectWidth={false}
        />
        {agentPriceHint && <div className={styles.settingsTip}>{agentPriceHint}</div>}
        <div className={styles.settingsTip}>挂载 Agent 后对话将按 Agent 定价计费</div>
      </div>

      {/* 知识库 */}
      <div className={styles.settingsSection}>
        <div className={styles.settingsLabel}>知识库</div>
        <Select
          {...kbSelectProps}
          value={knowledgeBaseId ?? GLOBAL_KB_VALUE}
          onChange={(v) =>
            onKnowledgeBaseChange(v === GLOBAL_KB_VALUE ? undefined : (v as number))
          }
          placeholder="全局搜索（默认）"
          allowClear
          style={{ width: '100%' }}
          popupMatchSelectWidth={false}
        />
        <div className={styles.settingsTip}>挂载知识库后，对话将优先检索知识库内容</div>
      </div>

      {/* 素材生成 */}
      <div className={styles.settingsSection}>
        <div className={styles.settingsLabel}>素材生成</div>
        <Space wrap>
          <Button
            icon={<ExperimentOutlined />}
            onClick={() => onOpenGeneration('image')}
          >
            文生图
          </Button>
          <Button
            icon={<ExperimentOutlined />}
            onClick={() => onOpenGeneration('video')}
          >
            文生视频
          </Button>
        </Space>
        <div className={styles.settingsTip}>生成结果以助手消息插入当前对话，并扣除相应积分</div>
      </div>

      {/* 需求模板（老板模式 / 客户会议模式步骤文案自定义） */}
      <div className={styles.settingsSection}>
        <div className={styles.settingsLabel}>需求模板</div>
        <Button icon={<EditOutlined />} onClick={onOpenDemandTemplate}>
          自定义老板模式 / 客户会议提问
        </Button>
        <div className={styles.settingsTip}>修改各步骤提问文案与必填规则，保存在本机</div>
      </div>
    </Drawer>
  )
}

export default ConversationSettings
