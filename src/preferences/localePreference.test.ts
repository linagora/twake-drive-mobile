import { resolveLanguage, LOCALE_SYSTEM } from './localePreference'

describe('resolveLanguage', () => {
  const available = ['en', 'fr', 'it']
  it('returns the device locale when preference is system and available', () => {
    expect(resolveLanguage(LOCALE_SYSTEM, ['fr'], available)).toBe('fr')
  })
  it('falls back to en when system + device locale not available', () => {
    expect(resolveLanguage(LOCALE_SYSTEM, ['de'], available)).toBe('en')
  })
  it('returns the chosen locale when it is available', () => {
    expect(resolveLanguage('it', ['fr'], available)).toBe('it')
  })
  it('ignores an unavailable chosen locale and uses the device locale', () => {
    expect(resolveLanguage('ru', ['fr'], available)).toBe('fr')
  })
  it('defaults to en when nothing matches', () => {
    expect(resolveLanguage('ru', ['de'], available)).toBe('en')
  })
  it('prefers the instance locale over the device locale on system', () => {
    expect(resolveLanguage(LOCALE_SYSTEM, ['fr', 'it'], available)).toBe('fr')
  })
  it('falls through to the device locale when the instance locale is unknown or unavailable', () => {
    expect(resolveLanguage(LOCALE_SYSTEM, [undefined, 'it'], available)).toBe('it')
    expect(resolveLanguage(LOCALE_SYSTEM, ['de', 'it'], available)).toBe('it')
  })
  it('keeps the explicit choice over the instance locale', () => {
    expect(resolveLanguage('it', ['fr', 'en'], available)).toBe('it')
  })
})
