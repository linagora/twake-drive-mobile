// The library, not `@/i18n`: importing the app's module would initialise
// i18next as a side effect of formatting a size.
import i18n from 'i18next'

/**
 * A size with the unit of the language in use: the units were French whatever
 * the language, so an English user read `28 o` and `11.8 Ko`.
 */
export const formatFileSize = (bytes: number | null | undefined): string => {
  if (bytes === null || bytes === undefined) return '—'
  const unit = (key: string): string => i18n.t(`units.${key}`)
  if (bytes < 1024) return `${bytes} ${unit('byte')}`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} ${unit('kilobyte')}`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} ${unit('megabyte')}`
  const gb = mb / 1024
  return `${gb.toFixed(1)} ${unit('gigabyte')}`
}
