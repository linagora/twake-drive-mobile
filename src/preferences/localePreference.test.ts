import { resolveLanguage, LOCALE_SYSTEM } from './localePreference'

describe('resolveLanguage', () => {
  const available = ['en', 'fr', 'it']
  it('returns the device locale when preference is system and available', () => {
    expect(resolveLanguage(LOCALE_SYSTEM, 'fr', available)).toBe('fr')
  })
  it('falls back to en when system + device locale not available', () => {
    expect(resolveLanguage(LOCALE_SYSTEM, 'de', available)).toBe('en')
  })
  it('returns the chosen locale when it is available', () => {
    expect(resolveLanguage('it', 'fr', available)).toBe('it')
  })
  it('ignores an unavailable chosen locale and uses the device locale', () => {
    expect(resolveLanguage('ru', 'fr', available)).toBe('fr')
  })
  it('defaults to en when nothing matches', () => {
    expect(resolveLanguage('ru', 'de', available)).toBe('en')
  })
})

describe('getLocalePreference', () => {
  const flag = process.env.EXPO_PUBLIC_E2E

  afterEach(() => {
    if (flag === undefined) delete process.env.EXPO_PUBLIC_E2E
    else process.env.EXPO_PUBLIC_E2E = flag
  })

  // The e2e emulator is English and every flow selects on the French labels.
  // A preference is the one answer both the cold launch and the instance-locale
  // sync honour, so that is where the e2e build says French.
  it('answers French for the e2e build when nothing was chosen', () => {
    process.env.EXPO_PUBLIC_E2E = '1'
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getLocalePreference } = require('./localePreference')
      expect(getLocalePreference()).toBe('fr')
    })
  })

  it('follows the system otherwise', () => {
    delete process.env.EXPO_PUBLIC_E2E
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getLocalePreference, LOCALE_SYSTEM } = require('./localePreference')
      expect(getLocalePreference()).toBe(LOCALE_SYSTEM)
    })
  })
})
