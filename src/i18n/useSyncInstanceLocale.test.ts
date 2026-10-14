jest.mock('@/account/useCurrentUser', () => ({ useCurrentUser: jest.fn() }))
jest.mock('cozy-client', () => ({ useClient: () => ({}) }))
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'de' }] }))
jest.mock('@/client/refreshInstanceLocale', () => ({ refreshInstanceLocale: jest.fn() }))
jest.mock('@/preferences/localePreference', () => ({
  ...jest.requireActual('@/preferences/localePreference'),
  getLocalePreference: jest.fn(),
  getInstanceLocale: jest.fn(),
  setInstanceLocale: jest.fn()
}))
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: {
    language: 'en',
    options: { resources: { en: {}, fr: {}, de: {}, it: {} } },
    changeLanguage: jest.fn()
  }
}))

import { renderHook, waitFor } from '@testing-library/react-native'

import i18n from '@/i18n'
import { useCurrentUser } from '@/account/useCurrentUser'
import { refreshInstanceLocale } from '@/client/refreshInstanceLocale'
import {
  getInstanceLocale,
  getLocalePreference,
  setInstanceLocale
} from '@/preferences/localePreference'
import { useSyncInstanceLocale } from './useSyncInstanceLocale'

const setup = ({
  pref = 'system',
  live,
  kept,
  fresh
}: {
  pref?: string
  live?: string
  kept?: string
  fresh?: string
}): void => {
  ;(getLocalePreference as jest.Mock).mockReturnValue(pref)
  ;(useCurrentUser as jest.Mock).mockReturnValue({ locale: live })
  ;(getInstanceLocale as jest.Mock).mockReturnValue(kept)
  ;(refreshInstanceLocale as jest.Mock).mockResolvedValue(fresh)
}

describe('useSyncInstanceLocale', () => {
  beforeEach(() => jest.clearAllMocks())

  it('switches to the instance locale when the settings query has it, and keeps it', () => {
    setup({ live: 'fr' })
    renderHook(() => useSyncInstanceLocale())
    expect(i18n.changeLanguage).toHaveBeenCalledWith('fr')
    expect(setInstanceLocale).toHaveBeenCalledWith('fr')
  })

  it('uses the instance locale kept from an earlier launch when the query has none', () => {
    setup({ kept: 'fr' })
    renderHook(() => useSyncInstanceLocale())
    expect(i18n.changeLanguage).toHaveBeenCalledWith('fr')
  })

  it('follows a language changed on the instance, read from the stack', async () => {
    setup({ kept: 'fr', fresh: 'it' })
    renderHook(() => useSyncInstanceLocale())
    await waitFor(() => expect(i18n.changeLanguage).toHaveBeenCalledWith('it'))
  })

  it('keeps an explicit user override over the instance locale', () => {
    setup({ pref: 'it', live: 'fr' })
    renderHook(() => useSyncInstanceLocale())
    expect(i18n.changeLanguage).toHaveBeenCalledWith('it')
  })

  it('falls back to the device language when the instance locale is unknown', () => {
    setup({})
    renderHook(() => useSyncInstanceLocale())
    expect(i18n.changeLanguage).toHaveBeenCalledWith('de')
  })

  it('falls back to the device language when the instance locale is not bundled', () => {
    setup({ live: 'pt' })
    renderHook(() => useSyncInstanceLocale())
    expect(i18n.changeLanguage).toHaveBeenCalledWith('de')
  })

  it('does nothing when already on the resolved language', () => {
    setup({ live: 'en' })
    renderHook(() => useSyncInstanceLocale())
    expect(i18n.changeLanguage).not.toHaveBeenCalled()
  })
})
