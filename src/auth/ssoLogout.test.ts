import { AppState } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'

import { closeSsoSession, ssoLogoutUrl } from './ssoLogout'

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
  dismissBrowser: jest.fn(() => Promise.resolve()),
  WebBrowserResultType: { CANCEL: 'cancel', DISMISS: 'dismiss', OPENED: 'opened', LOCKED: 'locked' }
}))
jest.mock('expo-linking', () => ({ addEventListener: jest.fn() }))

const wb = WebBrowser as unknown as { openBrowserAsync: jest.Mock; dismissBrowser: jest.Mock }
const linking = Linking as unknown as { addEventListener: jest.Mock }

describe('closeSsoSession', () => {
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
  })

  it('opens the logout page in the browser the login ran in', () => {
    wb.openBrowserAsync.mockReturnValue(new Promise(() => undefined))
    void closeSsoSession('https://sso.example.com/oauth2/logout')
    expect(wb.openBrowserAsync).toHaveBeenCalledWith('https://sso.example.com/oauth2/logout')
  })

  it('closes the browser once the portal says the session is gone', async () => {
    wb.openBrowserAsync.mockReturnValue(new Promise(() => undefined))
    const done = closeSsoSession('https://sso.example.com/oauth2/logout')
    urlHandler({ url: 'twakedrive://afterlogout' })
    await done
    expect(wb.dismissBrowser).toHaveBeenCalled()
    expect(remove).toHaveBeenCalled()
  })

  it('leaves the browser alone for a link that is not the end of the logout', () => {
    wb.openBrowserAsync.mockReturnValue(new Promise(() => undefined))
    void closeSsoSession('https://sso.example.com/oauth2/logout')
    urlHandler({ url: 'twakedrive:///search' })
    expect(wb.dismissBrowser).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('stops listening when the user closes the browser themselves', async () => {
    wb.openBrowserAsync.mockResolvedValue({ type: 'cancel' })
    await closeSsoSession('https://sso.example.com/oauth2/logout')
    expect(remove).toHaveBeenCalled()
  })

  describe('on Android, where the tab answers as soon as it is launched', () => {
    let appStateHandler: (state: string) => void
    const initialState = AppState.currentState

    beforeEach(() => {
      jest.spyOn(AppState, 'addEventListener').mockImplementation(((
        _evt: string,
        cb: (state: string) => void
      ) => {
        appStateHandler = cb
        return { remove: jest.fn() }
      }) as never)
      wb.openBrowserAsync.mockResolvedValue({ type: 'opened' })
    })

    afterEach(() => {
      AppState.currentState = initialState
      jest.restoreAllMocks()
    })

    it('ends when the app comes back to the front', async () => {
      AppState.currentState = 'active'
      let ended = false
      const done = closeSsoSession('https://sso.example.com/oauth2/logout').then(() => {
        ended = true
      })
      await Promise.resolve()
      await Promise.resolve()
      appStateHandler('background')
      expect(ended).toBe(false)
      appStateHandler('active')
      await done
      expect(ended).toBe(true)
    })

    it('ends when the tab had already covered the app by the time it answered', async () => {
      AppState.currentState = 'background'
      const done = closeSsoSession('https://sso.example.com/oauth2/logout')
      await Promise.resolve()
      await Promise.resolve()
      appStateHandler('active')
      await expect(done).resolves.toBeUndefined()
    })
  })

  it('never fails the logout when the browser cannot open', async () => {
    wb.openBrowserAsync.mockRejectedValue(new Error('already presented'))
    await expect(closeSsoSession('https://sso.example.com/oauth2/logout')).resolves.toBeUndefined()
    expect(remove).toHaveBeenCalled()
  })

  it('does nothing without a logout page to open', async () => {
    await closeSsoSession(null)
    expect(wb.openBrowserAsync).not.toHaveBeenCalled()
  })
})

describe('ssoLogoutUrl', () => {
  const clientHolding = (instance: unknown) =>
    ({ getQueryFromState: jest.fn(() => ({ data: instance })) }) as never

  it("is the instance's own SSO logout page when the stack names one", () => {
    const client = clientHolding({
      attributes: { oidc_logout_url: 'https://sso.example.com/oauth2/logout' }
    })
    expect(ssoLogoutUrl(client, 'https://sign-up.example.com')).toBe(
      'https://sso.example.com/oauth2/logout'
    )
    expect((client as { getQueryFromState: jest.Mock }).getQueryFromState).toHaveBeenCalledWith(
      'io.cozy.settings/instance'
    )
  })

  it('reads the instance settings whichever shape the store holds them in', () => {
    expect(
      ssoLogoutUrl(clientHolding({ oidc_logout_url: 'https://sso.example.com/out' }), undefined)
    ).toBe('https://sso.example.com/out')
    expect(
      ssoLogoutUrl(clientHolding([{ oidc_logout_url: 'https://sso.example.com/out' }]), undefined)
    ).toBe('https://sso.example.com/out')
  })

  it('falls back to the sign-up portal when the stack names no logout page', () => {
    expect(ssoLogoutUrl(clientHolding({ attributes: {} }), 'https://sign-up.example.com')).toBe(
      'https://sign-up.example.com/logout?url=twakedrive://afterlogout'
    )
  })

  it('falls back to the sign-up portal when the settings were never loaded', () => {
    const client = { getQueryFromState: jest.fn(() => null) } as never
    expect(ssoLogoutUrl(client, 'https://sign-up.example.com')).toBe(
      'https://sign-up.example.com/logout?url=twakedrive://afterlogout'
    )
  })

  it('is nothing on an instance with neither', () => {
    expect(ssoLogoutUrl(clientHolding({}), undefined)).toBeNull()
    expect(ssoLogoutUrl(null, undefined)).toBeNull()
  })
})
