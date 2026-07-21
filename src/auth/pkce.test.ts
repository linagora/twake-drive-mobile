import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'

import { openLoginUrl, openAuthorizeUrl } from './pkce'
import { UserCancelledError } from './types'

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
  openAuthSessionAsync: jest.fn(),
  dismissBrowser: jest.fn(() => Promise.resolve()),
  WebBrowserResultType: { CANCEL: 'cancel', DISMISS: 'dismiss', OPENED: 'opened', LOCKED: 'locked' }
}))
jest.mock('expo-linking', () => ({ addEventListener: jest.fn() }))
jest.mock('expo-crypto', () => ({}))

const wb = WebBrowser as unknown as {
  openBrowserAsync: jest.Mock
  openAuthSessionAsync: jest.Mock
  dismissBrowser: jest.Mock
}
const linking = Linking as unknown as { addEventListener: jest.Mock }

describe('openLoginUrl (shared-jar Custom Tab)', () => {
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
    wb.dismissBrowser.mockReturnValue(undefined)
  })

  it('opens openBrowserAsync (SFVC jar), never an auth session', () => {
    wb.openBrowserAsync.mockReturnValue(new Promise(() => undefined))
    void openLoginUrl('https://login.example.com/oauth')
    expect(wb.openBrowserAsync).toHaveBeenCalledWith('https://login.example.com/oauth', {
      showInRecents: true
    })
    expect(wb.openAuthSessionAsync).not.toHaveBeenCalled()
  })

  it('resolves with the cozy:// redirect captured via the deep-link listener', async () => {
    wb.openBrowserAsync.mockReturnValue(new Promise(() => undefined))
    const p = openLoginUrl('https://x/oauth')
    urlHandler({ url: 'cozy://?code=abc123' })
    await expect(p).resolves.toBe('cozy://?code=abc123')
    expect(remove).toHaveBeenCalled()
  })

  it('lets a redirect win over a racing tab-close', async () => {
    wb.openBrowserAsync.mockResolvedValue({ type: 'cancel' })
    const p = openLoginUrl('https://x/oauth')
    urlHandler({ url: 'cozy://?code=win' })
    await expect(p).resolves.toBe('cozy://?code=win')
  })

  it('rejects fast (short grace) when the user closes the browser (cancel)', async () => {
    jest.useFakeTimers()
    wb.openBrowserAsync.mockResolvedValue({ type: 'cancel' })
    const p = openLoginUrl('https://x/oauth')
    const assertion = expect(p).rejects.toBeInstanceOf(UserCancelledError)
    await Promise.resolve()
    await Promise.resolve()
    jest.advanceTimersByTime(500)
    await assertion
    jest.useRealTimers()
  })

  it('keeps the long grace on a non-cancel close (dismiss refocus race)', async () => {
    jest.useFakeTimers()
    wb.openBrowserAsync.mockResolvedValue({ type: 'dismiss' })
    const p = openLoginUrl('https://x/oauth')
    let settled = false
    void p.catch(() => {
      settled = true
    })
    await Promise.resolve()
    await Promise.resolve()
    jest.advanceTimersByTime(500)
    await Promise.resolve()
    expect(settled).toBe(false)
    jest.advanceTimersByTime(4000)
    await expect(p).rejects.toBeInstanceOf(UserCancelledError)
    jest.useRealTimers()
  })
})

describe('openAuthorizeUrl (system browser — survives the email-code excursion)', () => {
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
    wb.dismissBrowser.mockReturnValue(undefined)
  })

  // The flagship certification makes the user leave the tab to read a 6-digit
  // code from their mail and come back. openAuthSessionAsync cancels when the app
  // is backgrounded, aborting login on OIDC/LemonLDAP — so the authorize flow must
  // use the plain external Custom Tab + a deep-link listener (like openLoginUrl),
  // which survives the excursion while staying an external user-agent (RFC 8252).
  it('opens openBrowserAsync (external Custom Tab), never an auth session', () => {
    wb.openBrowserAsync.mockReturnValue(new Promise(() => undefined))
    void openAuthorizeUrl('https://x/auth/authorize')
    expect(wb.openBrowserAsync).toHaveBeenCalledWith('https://x/auth/authorize', {
      showInRecents: true
    })
    expect(wb.openAuthSessionAsync).not.toHaveBeenCalled()
  })

  it('resolves with the cozy:// redirect captured via the deep-link listener', async () => {
    wb.openBrowserAsync.mockReturnValue(new Promise(() => undefined))
    const p = openAuthorizeUrl('https://x/auth/authorize')
    urlHandler({ url: 'cozy://?code=abc' })
    await expect(p).resolves.toBe('cozy://?code=abc')
    expect(remove).toHaveBeenCalled()
  })

  it('lets a redirect win over a racing tab-close', async () => {
    wb.openBrowserAsync.mockResolvedValue({ type: 'cancel' })
    const p = openAuthorizeUrl('https://x/auth/authorize')
    urlHandler({ url: 'cozy://?code=win' })
    await expect(p).resolves.toBe('cozy://?code=win')
  })
})
