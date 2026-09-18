import i18n from '@/i18n'

import { formatFileSize } from './formatters'

describe('formatFileSize', () => {
  const language = i18n.language

  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  afterAll(async () => {
    await i18n.changeLanguage(language)
  })

  it('returns "—" for null/undefined', () => {
    expect(formatFileSize(null)).toBe('—')
    expect(formatFileSize(undefined)).toBe('—')
  })

  it('formats bytes', () => {
    expect(formatFileSize(0)).toBe('0 o')
    expect(formatFileSize(512)).toBe('512 o')
  })

  it('formats kibibytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 Ko')
    expect(formatFileSize(2560)).toBe('2.5 Ko')
  })

  it('formats mebibytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 Mo')
    expect(formatFileSize(1024 * 1024 * 3.7)).toBe('3.7 Mo')
  })

  it('formats gibibytes', () => {
    expect(formatFileSize(1024 ** 3)).toBe('1.0 Go')
  })

  it('says the units in the language in use', async () => {
    await i18n.changeLanguage('en')
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(1024)).toBe('1.0 KB')
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB')
    expect(formatFileSize(1024 ** 3)).toBe('1.0 GB')
  })

  it('says them in a language with its own alphabet too', async () => {
    await i18n.changeLanguage('ru')
    expect(formatFileSize(1024)).toBe('1.0 КБ')
  })
})
