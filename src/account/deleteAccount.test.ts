import type CozyClient from 'cozy-client'

const mockOpenBrowser = jest.fn()
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowser(...args)
}))

import { deleteAccountUrl, openDeleteAccount } from './deleteAccount'

const client = {
  getStackClient: () => ({ uri: 'https://mine.twake.test' })
} as unknown as CozyClient

describe('deleteAccountUrl', () => {
  it('points at the deletion route of the settings app', () => {
    expect(deleteAccountUrl('https://mine.twake.test')).toBe(
      'https://mine-settings.twake.test/#/profile/delete'
    )
  })

  it('carries a session code so the page opens signed in', () => {
    expect(deleteAccountUrl('https://mine.twake.test', 'code-42')).toBe(
      'https://mine-settings.twake.test/?session_code=code-42#/profile/delete'
    )
  })
})

describe('openDeleteAccount', () => {
  beforeEach(() => jest.clearAllMocks())

  it('opens the signed-in page in the in-app browser', async () => {
    await openDeleteAccount(client, () => Promise.resolve('code-42'))
    expect(mockOpenBrowser).toHaveBeenCalledWith(
      'https://mine-settings.twake.test/?session_code=code-42#/profile/delete'
    )
  })

  it('still opens the page when the stack refuses a session code', async () => {
    await openDeleteAccount(client, () => Promise.reject(new Error('Not authorized')))
    expect(mockOpenBrowser).toHaveBeenCalledWith(
      'https://mine-settings.twake.test/#/profile/delete'
    )
  })

  it('opens the page without a code when no session code is asked for', async () => {
    await openDeleteAccount(client)
    expect(mockOpenBrowser).toHaveBeenCalledWith(
      'https://mine-settings.twake.test/#/profile/delete'
    )
  })
})
