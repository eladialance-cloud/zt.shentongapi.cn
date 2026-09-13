import { useContext } from 'react'
import { I18nContext } from './I18nContext'
import { DEFAULT_ACTIVE_LOCALE, t as translate } from './i18n'
import type { AppLocale } from './i18n'

export function useI18n(): {
  locale: AppLocale
  setLocale: (locale: AppLocale) => void
  t: (key: string, options?: Record<string, unknown>) => string
} {
  const ctx = useContext(I18nContext)
  const locale = ctx?.locale ?? DEFAULT_ACTIVE_LOCALE
  const setLocale = ctx?.setLocale ?? (() => {})
  return { locale, setLocale, t: translate }
}
