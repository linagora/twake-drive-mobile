import { AppState, Platform } from 'react-native'
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
    openLoginUrl('https://login.example.com/oauth').catch(() => undefined)
    expect(wb.openBrowserAsync).toHaveBeenCalledWith('https://login.example.com/oauth', {
      showInRecents: true
    })
    expect(wb.openAuthSessionAsync).not.toHaveBeenCalled()
  })

  it('resolves with the twakedrive:// redirect captured via the deep-link listener', async () => {
    wb.openBrowserAsync.mockReturnValue(new Promise(() => undefined))
    const p = openLoginUrl('https://x/oauth')
    urlHandler({ url: 'twakedrive://?code=abc123' })
    await expect(p).resolves.toBe('twakedrive://?code=abc123')
    expect(remove).toHaveBeenCalled()
  })

  it('lets a redirect win over a racing tab-close', async () => {
    wb.openBrowserAsync.mockResolvedValue({ type: 'cancel' })
    const p = openLoginUrl('https://x/oauth')
    urlHandler({ url: 'twakedrive://?code=win' })
    await expect(p).resolves.toBe('twakedrive://?code=win')
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

  it('aborts a previous in-flight flow when a new attempt starts', async () => {
    // Flow 1 never settles on its own (browser stays open, no redirect): only
    // starting a new attempt may resolve it — by aborting it.
    wb.openBrowserAsync.mockReturnValue(new Promise(() => undefined))
    const p1 = openLoginUrl('https://x/oauth1')
    const flow1Aborted = expect(p1).rejects.toBeInstanceOf(UserCancelledError)

    const p2 = openLoginUrl('https://x/oauth2')
    await flow1Aborted

    urlHandler({ url: 'twakedrive://?code=flow2' })
    await expect(p2).resolves.toBe('twakedrive://?code=flow2')
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

describe('openAuthorizeUrl (fast native redirect + email-code fallback)', () => {
  let urlHandler: (e: { url: string }) => void
  let appStateHandler: (state: string) => void
  let remove: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    remove = jest.fn()
    linking.addEventListener.mockImplementation(
      (_evt: string, cb: (e: { url: string }) => void) => {
        urlHandler = cb
        return { remove }
      }
    )
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _evt: string,
      cb: (state: string) => void
    ) => {
      appStateHandler = cb
      return { remove: jest.fn() }
    }) as never)
    wb.dismissBrowser.mockReturnValue(undefined)
  })

  afterEach(() => jest.useRealTimers())

  // The stack's /auth/authorize redirects to twakedrive:// instantly with no UI.
  // openAuthSessionAsync captures that native redirect reliably; the
  // openBrowserAsync + deep-link path misses the instant custom-scheme redirect.
  it('captures the instant redirect via openAuthSessionAsync (fast path)', async () => {
    wb.openAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'twakedrive://?code=fast' })
    await expect(openAuthorizeUrl('https://x/auth/authorize')).resolves.toBe(
      'twakedrive://?code=fast'
    )
    expect(wb.openAuthSessionAsync).toHaveBeenCalledWith(
      'https://x/auth/authorize',
      'twakedrive://',
      {
        showInRecents: false
      }
    )
    expect(wb.openBrowserAsync).not.toHaveBeenCalled()
  })

  // An uncertified client shows the email-code form instead of redirecting; the
  // user leaves to read the 6-digit code, which aborts openAuthSessionAsync on
  // refocus. Fall back to the system browser + deep-link listener, which survives
  // the mail excursion (the flagship certification path).
  it('falls back to the system browser once the user has left for their mail', async () => {
    wb.openAuthSessionAsync.mockImplementation(async () => {
      appStateHandler('background')
      return { type: 'dismiss' }
    })
    wb.openBrowserAsync.mockReturnValue(new Promise(() => undefined))
    const p = openAuthorizeUrl('https://x/auth/authorize')
    for (let i = 0; i < 10; i++) await Promise.resolve()
    jest.advanceTimersByTime(1000)
    for (let i = 0; i < 10; i++) await Promise.resolve()
    urlHandler({ url: 'twakedrive://?code=viacustomtab' })
    await expect(p).resolves.toBe('twakedrive://?code=viacustomtab')
    expect(wb.openBrowserAsync).toHaveBeenCalledWith('https://x/auth/authorize', {
      showInRecents: true
    })
  })

  // Closing the sheet without ever leaving the app is the user giving up.
  // Answering that with another browser reopened the stack's login page on
  // someone who had just cancelled, and the presentation was dropped by UIKit
  // anyway, which is what left the app spinning (#293).
  it('gives up when the sheet is closed without the user leaving the app', async () => {
    wb.openAuthSessionAsync.mockResolvedValue({ type: 'cancel', url: null })

    await expect(openAuthorizeUrl('https://x/auth/authorize')).rejects.toBeInstanceOf(
      UserCancelledError
    )
    expect(wb.openBrowserAsync).not.toHaveBeenCalled()
  })

  // iOS reports `inactive` merely for presenting the session's own sheet, so
  // counting anything but `background` made the fallback fire on every cancel.
  it('does not take the session sheet appearing for the user leaving', async () => {
    wb.openAuthSessionAsync.mockImplementation(async () => {
      appStateHandler('inactive')
      appStateHandler('active')
      return { type: 'cancel', url: null }
    })

    await expect(openAuthorizeUrl('https://x/auth/authorize')).rejects.toBeInstanceOf(
      UserCancelledError
    )
    expect(wb.openBrowserAsync).not.toHaveBeenCalled()
  })
})

describe('openAuthorizeUrl on Android', () => {
  let urlHandler: (e: { url: string }) => void
  let remove: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
    remove = jest.fn()
    linking.addEventListener.mockImplementation(
      (_evt: string, cb: (e: { url: string }) => void) => {
        urlHandler = cb
        return { remove }
      }
    )
    wb.dismissBrowser.mockReturnValue(undefined)
  })

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
  })

  // Android delivers the custom-scheme intent to the app, so the Custom Tab
  // catches the instant redirect as well as surviving the mail excursion the
  // email-code certification needs. Going through the auth session first only
  // bought a second consent screen when it was dismissed.
  it('goes straight to the Custom Tab, never the auth session', async () => {
    wb.openBrowserAsync.mockReturnValue(new Promise(() => undefined))
    const p = openAuthorizeUrl('https://x/auth/authorize')
    await Promise.resolve()
    urlHandler({ url: 'twakedrive://?code=android' })
    await expect(p).resolves.toBe('twakedrive://?code=android')
    expect(wb.openAuthSessionAsync).not.toHaveBeenCalled()
    expect(wb.openBrowserAsync).toHaveBeenCalledWith('https://x/auth/authorize', {
      showInRecents: true
    })
  })
})

// Android's openBrowserAsync answers `opened` the moment the tab is launched
// (WebBrowserModule.kt), so it says nothing about the user closing it. Treating
// it as "the browser is gone" gave the whole sign-in four seconds (#324).
describe('a Custom Tab that only reports being opened', () => {
  let urlHandler: (e: { url: string }) => void
  let appStateHandler: (state: string) => void
  let removeAppState: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    removeAppState = jest.fn()
    linking.addEventListener.mockImplementation(
      (_evt: string, cb: (e: { url: string }) => void) => {
        urlHandler = cb
        return { remove: jest.fn() }
      }
    )
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _evt: string,
      cb: (state: string) => void
    ) => {
      appStateHandler = cb
      return { remove: removeAppState }
    }) as never)
    wb.dismissBrowser.mockReturnValue(undefined)
  })

  afterEach(() => jest.useRealTimers())

  const openTab = (): Promise<string> => {
    wb.openBrowserAsync.mockResolvedValue({ type: 'opened' })
    return openLoginUrl('https://login.example.com/oauth')
  }

  it('leaves the user time to sign in instead of giving up on a timer', async () => {
    const p = openTab()
    const settled = jest.fn()
    void p.then(settled, settled)
    await Promise.resolve()

    jest.advanceTimersByTime(60_000)
    await Promise.resolve()

    expect(settled).not.toHaveBeenCalled()
    urlHandler({ url: 'twakedrive://?code=typed-slowly' })
    await expect(p).resolves.toBe('twakedrive://?code=typed-slowly')
  })

  it('gives up once the app is back in front, the tab being gone', async () => {
    const p = openTab()
    await Promise.resolve()

    appStateHandler('background')
    appStateHandler('active')
    jest.advanceTimersByTime(500)

    await expect(p).rejects.toBeInstanceOf(UserCancelledError)
  })

  it('stays out of the way while the user is still in the tab', async () => {
    const p = openTab()
    const settled = jest.fn()
    void p.then(settled, settled)
    await Promise.resolve()

    appStateHandler('active')
    jest.advanceTimersByTime(60_000)
    await Promise.resolve()

    expect(settled).not.toHaveBeenCalled()
    urlHandler({ url: 'twakedrive://?code=still-there' })
    await expect(p).resolves.toBe('twakedrive://?code=still-there')
  })

  it('stops listening to the app state once the flow is over', async () => {
    const p = openTab()
    await Promise.resolve()
    urlHandler({ url: 'twakedrive://?code=done' })
    await p

    expect(removeAppState).toHaveBeenCalled()
  })
})
