/**
 * 本地 Hermes Agent API 客户端
 * Hermes Agent 内置 API Server（OpenAI 兼容），监听 127.0.0.1:8642
 */

interface ChatCompletionsOptions {
  endpoint: string
  apiKey: string
  messages: Array<{ role: string; content: string }>
  stream?: boolean
  onMessage?: (chunk: string) => void
}

interface ChatCompletionsResult {
  content: string
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
}

export async function chatCompletions(opts: ChatCompletionsOptions): Promise<ChatCompletionsResult> {
  const url = `${opts.endpoint}/v1/chat/completions`
  const isStream = opts.stream ?? false
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120000)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: 'custom/deep-shentong',
        messages: opts.messages,
        stream: isStream,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`Hermes Agent API ${response.status}: ${errorText}`)
    }

    if (isStream && response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      let fullContent = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta?.content
              if (delta) {
                fullContent += delta
                opts.onMessage?.(delta)
              }
            } catch {
              /* ignore malformed chunks */
            }
          }
        }
      }
      // 处理 buffer 中剩余的最后一帧
      if (buffer.startsWith('data: ')) {
        const data = buffer.slice(6).trim()
        if (data && data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta?.content
            if (delta) {
              fullContent += delta
              opts.onMessage?.(delta)
            }
          } catch {
            /* ignore */
          }
        }
      }
      return { content: fullContent }
    } else {
      const data = await response.json()
      return {
        content: data.choices?.[0]?.message?.content ?? '',
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens ?? 0,
          completionTokens: data.usage.completion_tokens ?? 0,
          totalTokens: data.usage.total_tokens ?? 0,
        } : undefined,
      }
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function checkHealth(endpoint = 'http://127.0.0.1:8642'): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(`${endpoint}/health`, { signal: controller.signal })
    clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}
