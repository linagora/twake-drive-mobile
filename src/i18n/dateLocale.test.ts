import { de, enUS, es, fr, it as itLocale, ru, vi } from 'date-fns/locale'

import { dateLocaleForLanguage } from './dateLocale'

describe('dateLocaleForLanguage', () => {
  it.each([
    ['fr', fr],
    ['en', enUS],
    ['es', es],
    ['it', itLocale],
    ['de', de],
    ['vi', vi],
    ['ru', ru]
  ])('maps %s to its date-fns locale', (lang, expected) => {
    expect(dateLocaleForLanguage(lang as string)).toBe(expected)
  })

  it('strips a region suffix (fr-FR -> fr)', () => {
    expect(dateLocaleForLanguage('fr-FR')).toBe(fr)
  })

  it('falls back to enUS for an unknown or missing language', () => {
    expect(dateLocaleForLanguage('zz')).toBe(enUS)
    expect(dateLocaleForLanguage(undefined)).toBe(enUS)
  })
})
