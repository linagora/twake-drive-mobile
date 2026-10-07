import type CozyClient from 'cozy-client'

const mockOpenBrowser = jest.fn()
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowser(...args)
}))
jest.mock('cozy-client', () => ({
  __esModule: true,
  default: { fetchPolicies: { olderThan: jest.fn() } },
  Q: jest.fn(),
  useClient: jest.fn(),
  useQuery: jest.fn()
}))
jest.mock('@/auth/useSessionCode', () => ({ useSessionCode: jest.fn() }))

import { hasSettingsApp, openSettingsApp, settingsAppUrl } from './commonSettings'

const client = {
  getStackClient: () => ({ uri: 'https://mine.twake.test' })
} as unknown as CozyClient

describe('hasSettingsApp', () => {
  it('is true when the settings app is among the installed apps', () => {
    expect(hasSettingsApp([{ slug: 'drive' }, { slug: 'settings' }])).toBe(true)
  })

  it('is false without the settings app', () => {
    expect(hasSettingsApp([{ slug: 'drive' }])).toBe(false)
  })

  it('is false while the apps are unknown', () => {
    expect(hasSettingsApp(null)).toBe(false)
    expect(hasSettingsApp(undefined)).toBe(false)
    expect(hasSettingsApp([])).toBe(false)
  })
})

describe('settingsAppUrl', () => {
  it('points at a route of the settings app', () => {
    expect(settingsAppUrl('https://mine.twake.test', '/profile')).toBe(
      'https://mine-settings.twake.test/#/profile'
    )
  })
})

describe('openSettingsApp', () => {
  beforeEach(() => jest.clearAllMocks())

  it('opens the signed-in page in the in-app browser', async () => {
    await openSettingsApp(client, '/profile', () => Promise.resolve('code-42'))
    expect(mockOpenBrowser).toHaveBeenCalledWith(
      'https://mine-settings.twake.test/?session_code=code-42#/profile'
    )
  })

  it('still opens the page when the stack refuses a session code', async () => {
    await openSettingsApp(client, '/profile', () => Promise.reject(new Error('Not authorized')))
    expect(mockOpenBrowser).toHaveBeenCalledWith('https://mine-settings.twake.test/#/profile')
  })
})
