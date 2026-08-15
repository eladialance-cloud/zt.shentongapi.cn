// 异步任务配置表单（结构化，替代手工 JSON）
// 绑定 generationParams 的 snake_case 键，与后端 generation-client mergeGenerationAdapter 一致：
//   async / video_submit_path / images_path / video_query_path / image_task_path
//   task_id_path / task_status_path / success_values / failed_values / result_url_path
//   task_method / poll_interval / timeout_ms / extra_headers
//
// 用途：图片/视频生成平台多为「提交任务 -> 轮询查询 -> 拿结果 URL」的异步模式，
//       不同厂商（百炼/火山方舟/硅基流动等）端点、字段名不同，这里统一可填。
// 同步平台（OpenAI /images/generations 直接返回图片）不需要填写。
import { useEffect, useRef, useState } from 'react'
import { Input, InputNumber, Select, Space, Switch, Tag } from 'antd'

interface AsyncTaskConfigFormProps {
  /** 当前 generationParams 的 JSON 文本（undefined 表示空） */
  value?: string
  onChange: (next?: string) => void
  /** image / video：决定提交端点的键名（video_submit_path / images_path） */
  kind: 'image' | 'video'
}

function parseJson(s?: string): Record<string, unknown> {
  if (!s || !s.trim()) return {}
  try {
    const o = JSON.parse(s)
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function arrToText(v: unknown): string {
  return Array.isArray(v) ? v.map(String).join(',') : typeof v === 'string' ? v : ''
}

const FIELD_STYLE = { width: '100%' } as const

export default function AsyncTaskConfigForm({ value, onChange, kind }: AsyncTaskConfigFormProps) {
  const submitKey = kind === 'video' ? 'video_submit_path' : 'images_path'
  const queryKey = kind === 'video' ? 'video_query_path' : 'image_task_path'
  const [merged, setMerged] = useState<Record<string, unknown>>(() => parseJson(value))
  const lastEmitted = useRef<string | undefined>(value)
  const touched = useRef<Set<string>>(new Set())
  const mergedRef = useRef(merged)
  mergedRef.current = merged

  useEffect(() => {
    if (value === lastEmitted.current) return
    lastEmitted.current = value
    touched.current.clear()
    setMerged(parseJson(value))
  }, [value])

  const setField = (key: string, val: unknown) => {
    touched.current.add(key)
    const next = { ...mergedRef.current }
    if (val === '' || val == null || (Array.isArray(val) && val.length === 0)) {
      delete next[key]
    } else {
      next[key] = val
    }
    setMerged(next)
    const text = Object.keys(next).length ? JSON.stringify(next, null, 2) : undefined
    lastEmitted.current = text
    onChange(text)
  }

  const g = merged
  const submitPath = typeof g[submitKey] === 'string' ? (g[submitKey] as string) : ''
  const queryUrl = typeof g[queryKey] === 'string' ? (g[queryKey] as string) : ''
  const taskMethod = g.task_method === 'POST' ? 'POST' : 'GET'
  const taskIdPath = typeof g.task_id_path === 'string' ? (g.task_id_path as string) : ''
  const statusPath = typeof g.task_status_path === 'string' ? (g.task_status_path as string) : ''
  const successText = arrToText(g.success_values)
  const failedText = arrToText(g.failed_values)
  const resultUrlPath = typeof g.result_url_path === 'string' ? (g.result_url_path as string) : ''
  const pollInterval = typeof g.poll_interval === 'number' ? (g.poll_interval as number) : undefined
  const timeoutMs = typeof g.timeout_ms === 'number' ? (g.timeout_ms as number) : undefined
  const extraHeadersText =
    g.extra_headers && typeof g.extra_headers === 'object'
      ? JSON.stringify(g.extra_headers, null, 2)
      : ''
  const asyncOn = g.async === true

  const labelStyle = { display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 4 } as const

  return (
    <div
      style={{
        marginBottom: 14,
        padding: '10px 12px',
        border: '1px dashed rgba(139,92,246,.5)',
        borderRadius: 8,
        background: 'rgba(139,92,246,.04)'
      }}
    >
      <div style={{ marginBottom: 10, fontSize: 12, color: '#c4b5fd' }}>
        <b>异步任务配置</b>
        <span style={{ color: '#8b949e', marginLeft: 8 }}>
          （图片/视频生成平台：提交任务 → 轮询查询 → 拿结果 URL。同步平台无需填写）
        </span>
      </div>
      <Space direction="vertical" style={{ width: '100%' }} size={10}>
        <div>
          <span style={labelStyle}>异步任务（提交后轮询拿结果）</span>
          <Switch
            checked={asyncOn}
            onChange={(v) => setField('async', v)}
            checkedChildren="异步"
            unCheckedChildren="同步"
          />
        </div>
        <div>
          <span style={labelStyle}>
            提交URL {kind === 'video' ? '（video_submit_path）' : '（images_path）'}
          </span>
          <Input
            value={submitPath}
            onChange={(e) => setField(submitKey, e.target.value)}
            placeholder="完整提交端点，如 https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis"
          />
        </div>
        <div>
          <span style={labelStyle}>任务查询URL模板（含 {'{id}'} 占位）</span>
          <Input
            value={queryUrl}
            onChange={(e) => setField(queryKey, e.target.value)}
            placeholder="如 https://dashscope.aliyuncs.com/api/v1/tasks/{id}（可粘贴官方文档查询接口）"
          />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <span style={labelStyle}>查询方法</span>
            <Select
              value={taskMethod}
              onChange={(v) => setField('task_method', v)}
              style={FIELD_STYLE}
              options={[
                { label: 'GET', value: 'GET' },
                { label: 'POST', value: 'POST' }
              ]}
            />
          </div>
          <div style={{ flex: 1 }}>
            <span style={labelStyle}>任务ID响应路径</span>
            <Input
              value={taskIdPath}
              onChange={(e) => setField('task_id_path', e.target.value)}
              placeholder="如 output.task_id / data.id"
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <span style={labelStyle}>状态字段路径</span>
            <Input
              value={statusPath}
              onChange={(e) => setField('task_status_path', e.target.value)}
              placeholder="如 output.task_status / data.state"
            />
          </div>
          <div style={{ flex: 1 }}>
            <span style={labelStyle}>结果URL字段路径</span>
            <Input
              value={resultUrlPath}
              onChange={(e) => setField('result_url_path', e.target.value)}
              placeholder="如 output.results[0].url / data.video.url"
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <span style={labelStyle}>成功值（逗号分隔，如 SUCCEEDED,done）</span>
            <Input
              value={successText}
              onChange={(e) =>
                setField(
                  'success_values',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
              placeholder="如 SUCCEEDED / completed / done"
            />
          </div>
          <div style={{ flex: 1 }}>
            <span style={labelStyle}>失败值（逗号分隔，如 FAILED,CANCELED）</span>
            <Input
              value={failedText}
              onChange={(e) =>
                setField(
                  'failed_values',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
              placeholder="如 FAILED / CANCELED"
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <span style={labelStyle}>轮询间隔（毫秒）</span>
            <InputNumber
              value={pollInterval}
              onChange={(v) => setField('poll_interval', v ?? '')}
              min={500}
              step={500}
              placeholder="默认 3000"
              style={FIELD_STYLE}
            />
          </div>
          <div style={{ flex: 1 }}>
            <span style={labelStyle}>总超时（毫秒）</span>
            <InputNumber
              value={timeoutMs}
              onChange={(v) => setField('timeout_ms', v ?? '')}
              min={10000}
              step={10000}
              placeholder="默认 120000"
              style={FIELD_STYLE}
            />
          </div>
        </div>
        <div>
          <span style={labelStyle}>额外请求头（JSON，可选）</span>
          <Input.TextArea
            rows={2}
            value={extraHeadersText}
            onChange={(e) => {
              const t = e.target.value.trim()
              if (!t) {
                setField('extra_headers', '')
                return
              }
              try {
                setField('extra_headers', JSON.parse(t))
              } catch {
                /* JSON 未完成，暂不写入 */
              }
            }}
            placeholder={'{"X-Custom-Header": "value"}'}
          />
        </div>
        <div style={{ fontSize: 12, color: '#8b949e' }}>
          <Tag color="purple">提示</Tag>
          各平台字段不同：百炼任务ID在 <code>output.task_id</code>、结果在 <code>output.results[0].url</code>；火山方舟等在 <code>data.*</code>。粘贴官方 curl 可自动填好大部分，这里只需按平台微调。
        </div>
      </Space>
    </div>
  )
}
