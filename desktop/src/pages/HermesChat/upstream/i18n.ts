export type AppLocale = string

export const DEFAULT_ACTIVE_LOCALE: AppLocale = 'en'

import zhChat from './i18n/zh-chat'
import enChat from './i18n/en-chat'
import zhSoul from './i18n/zh-soul'
import enSoul from './i18n/en-soul'
import zhCommon from './i18n/zh-common'
import enCommon from './i18n/en-common'

type Dict = Record<string, string>

function flatten(obj: unknown, prefix = ''): Dict {
  const out: Dict = {}
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = prefix ? `${prefix}.${k}` : k
      if (v && typeof v === 'object') {
        Object.assign(out, flatten(v, key))
      } else if (typeof v === 'string') {
        out[key] = v
      }
    }
  }
  return out
}

const ZH: Dict = { ...flatten(zhCommon), ...flatten(zhChat), ...flatten(zhSoul) }
const EN: Dict = { ...flatten(enCommon), ...flatten(enChat), ...flatten(enSoul) }
const FALLBACK = { ...EN, ...ZH }

export function t(key: string, options?: Record<string, unknown>): string {
  let s = FALLBACK[key] ?? EN[key] ?? key
  if (options) {
    for (const [k, v] of Object.entries(options)) {
      s = s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v))
    }
  }
  return s
}
