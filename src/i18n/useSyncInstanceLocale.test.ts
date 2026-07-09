jest.mock('@/account/useCurrentUser', () => ({ useCurrentUser: jest.fn() }))
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }))
jest.mock('@/preferences/localePreference', () => ({
  ...jest.requireActual('@/preferences/localePreference'),
  getLocalePreference: jest.fn()
}))
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: {
    language: 'en',
    options: { resources: { en: {}, fr: {}, de: {} } },
    changeLanguage: jest.fn()
  }
}))

import { renderHook } from '@testing-library/react-native'

import i18n from '@/i18n'
import { useCurrentUser } from '@/account/useCurrentUser'
import { getLocalePreference } from '@/preferences/localePreference'
import { useSyncInstanceLocale } from './useSyncInstanceLocale'

describe('useSyncInstanceLocale', () => {
  beforeEach(() => jest.clearAllMocks())

  it('switches to the instance locale when the user has no override', () => {
    ;(useCurrentUser as jest.Mock).mockReturnValue({ locale: 'de' })
    ;(getLocalePreference as jest.Mock).mockReturnValue('system')
    renderHook(() => useSyncInstanceLocale())
    expect(i18n.changeLanguage).toHaveBeenCalledWith('de')
  })

  it('keeps an explicit user override over the instance locale', () => {
    ;(useCurrentUser as jest.Mock).mockReturnValue({ locale: 'de' })
    ;(getLocalePreference as jest.Mock).mockReturnValue('fr')
    renderHook(() => useSyncInstanceLocale())
    expect(i18n.changeLanguage).toHaveBeenCalledWith('fr')
  })

  it('does nothing when already on the resolved language', () => {
    ;(useCurrentUser as jest.Mock).mockReturnValue({ locale: 'en' })
    ;(getLocalePreference as jest.Mock).mockReturnValue('system')
    renderHook(() => useSyncInstanceLocale())
    expect(i18n.changeLanguage).not.toHaveBeenCalled()
  })
})
