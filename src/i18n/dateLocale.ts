import type { Locale } from 'date-fns'
import { de, enUS, es, fr, it, ru, vi } from 'date-fns/locale'

const LOCALES: Record<string, Locale> = { fr, en: enUS, es, it, de, vi, ru }

export const dateLocaleForLanguage = (language: string | undefined): Locale => {
  const code = (language ?? '').split('-')[0].toLowerCase()
  return LOCALES[code] ?? enUS
}
