import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'

import { openAuthorizeUrl } from './pkce'
import { UserCancelledError } from './types'

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
  openAuthSessionAsync: jest.fn(),
  dismissBrowser: jest.fn(() => Promise.resolve())
}))
jest.mock('expo-linking', () => ({ addEventListener: jest.fn() }))
jest.mock('expo-crypto', () => ({}))

const wb = WebBrowser as unknown as {
  openBrowserAsync: jest.Mock
  openAuthSessionAsync: jest.Mock
  dismissBrowser: jest.Mock
}
const linking = Linking as unknown as { addEventListener: jest.Mock }

describe('openAuthorizeUrl', () => {
  let urlHandler: (e: { url: string }) => void
  let remove: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    remove = jest.fn()
    linking.addEventListener.mockImplementation(
      (_evt: string, cb: (e: { url: string }) => void) => {
        urlHandler = cb
        return { remove }
      }
    )
    // Android's dismissBrowser returns void (not a Promise). Mimic that here so a
    // regression that calls `.catch` on it (which crashed the real login) fails.
    wb.dismissBrowser.mockReturnValue(undefined)
  })

  // The certification page emails a 6-digit code, so the user leaves to their mail
  // app and comes back. A plain Custom Tab survives that; openAuthSessionAsync does
  // not (it resolves {type:'dismiss'} on refocus), so we must never use it here.
  it('opens a plain Custom Tab (openBrowserAsync), never an auth session', () => {
    wb.openBrowserAsync.mockReturnValue(new Promise(() => undefined))
    void openAuthorizeUrl('https://alice.example.com/auth/authorize')
    expect(wb.openBrowserAsync).toHaveBeenCalledWith('https://alice.example.com/auth/authorize', {
      showInRecents: true
    })
    expect(wb.openAuthSessionAsync).not.toHaveBeenCalled()
  })

  it('resolves with the cozy:// redirect captured via the deep-link listener', async () => {
    // Tab stays open (the mail excursion): the completion signal is the deep link.
    wb.openBrowserAsync.mockReturnValue(new Promise(() => undefined))
    const p = openAuthorizeUrl('https://x/auth/authorize')
    urlHandler({ url: 'cozy://?code=abc123' })
    await expect(p).resolves.toBe('cozy://?code=abc123')
    expect(remove).toHaveBeenCalled()
    expect(wb.dismissBrowser).toHaveBeenCalled()
  })

  it('rejects UserCancelledError when the tab is closed without certifying', async () => {
    wb.openBrowserAsync.mockResolvedValue({ type: 'cancel' })
    await expect(openAuthorizeUrl('https://x/auth/authorize')).rejects.toBeInstanceOf(
      UserCancelledError
    )
  })

  it('lets a redirect win over a racing tab-close (no false cancel)', async () => {
    wb.openBrowserAsync.mockResolvedValue({ type: 'dismiss' })
    const p = openAuthorizeUrl('https://x/auth/authorize')
    urlHandler({ url: 'cozy://?code=win' })
    await expect(p).resolves.toBe('cozy://?code=win')
  })
})
