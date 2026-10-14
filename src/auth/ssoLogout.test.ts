import { AppState } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'

import { closeSsoSession, ssoLogoutUrl } from './ssoLogout'

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
  dismissBrowser: jest.fn(() => Promise.resolve()),
  WebBrowserResultType: { CANCEL: 'cancel', DISMISS: 'dismiss', OPENED: 'opened', LOCKED: 'locked' }
}))
jest.mock('expo-crypto', () => ({ randomUUID: () => 'fixed-state' }))
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
    void closeSsoSession({ url: 'https://sso.example.com/oauth2/logout' })
    expect(wb.openBrowserAsync).toHaveBeenCalledWith('https://sso.example.com/oauth2/logout')
  })

  it('closes the browser once the portal says the session is gone', async () => {
    wb.openBrowserAsync.mockReturnValue(new Promise(() => undefined))
    const done = closeSsoSession({ url: 'https://sso.example.com/oauth2/logout' })
    urlHandler({ url: 'twakedrive://afterlogout' })
    await done
    expect(wb.dismissBrowser).toHaveBeenCalled()
    expect(remove).toHaveBeenCalled()
  })

  it('ignores a return that carries another state', () => {
    wb.openBrowserAsync.mockReturnValue(new Promise(() => undefined))
    void closeSsoSession({ url: 'https://sso.example.com/oauth2/logout', state: 'mine' })
    urlHandler({ url: 'twakedrive://afterlogout?state=other' })
    urlHandler({ url: 'twakedrive://afterlogout' })
    expect(wb.dismissBrowser).not.toHaveBeenCalled()
    urlHandler({ url: 'twakedrive://afterlogout?state=mine' })
    expect(wb.dismissBrowser).toHaveBeenCalled()
  })

  it('leaves the browser alone for a link that is not the end of the logout', () => {
    wb.openBrowserAsync.mockReturnValue(new Promise(() => undefined))
    void closeSsoSession({ url: 'https://sso.example.com/oauth2/logout' })
    urlHandler({ url: 'twakedrive:///search' })
    expect(wb.dismissBrowser).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('stops listening when the user closes the browser themselves', async () => {
    wb.openBrowserAsync.mockResolvedValue({ type: 'cancel' })
    await closeSsoSession({ url: 'https://sso.example.com/oauth2/logout' })
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
      const done = closeSsoSession({ url: 'https://sso.example.com/oauth2/logout' }).then(() => {
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
      const done = closeSsoSession({ url: 'https://sso.example.com/oauth2/logout' })
      await Promise.resolve()
      await Promise.resolve()
      appStateHandler('active')
      await expect(done).resolves.toBeUndefined()
    })
  })

  it('never fails the logout when the browser cannot open', async () => {
    wb.openBrowserAsync.mockRejectedValue(new Error('already presented'))
    await expect(
      closeSsoSession({ url: 'https://sso.example.com/oauth2/logout' })
    ).resolves.toBeUndefined()
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
  const RETURN =
    'post_logout_redirect_uri=twakedrive%3A%2F%2Fafterlogout&state=fixed-state&confirm=1'
  const fetchMock = jest.fn()
  const urlOf = async (...args: Parameters<typeof ssoLogoutUrl>) =>
    (await ssoLogoutUrl(...args))?.url ?? null

  beforeEach(() => {
    fetchMock.mockReset().mockRejectedValue(new Error('offline'))
    global.fetch = fetchMock as never
  })

  it("is the instance's own SSO logout page, told where to send the browser back", async () => {
    const client = clientHolding({
      attributes: { oidc_logout_url: 'https://sso.example.com/oauth2/logout' }
    })
    expect(await urlOf(client, 'https://sign-up.example.com')).toBe(
      `https://sso.example.com/oauth2/logout?${RETURN}`
    )
    expect((client as { getQueryFromState: jest.Mock }).getQueryFromState).toHaveBeenCalledWith(
      'io.cozy.settings/instance'
    )
  })

  it('reads the instance settings whichever shape the store holds them in', async () => {
    const out = `https://sso.example.com/out?${RETURN}`
    expect(await urlOf(clientHolding({ oidc_logout_url: 'https://sso.example.com/out' }))).toBe(out)
    expect(await urlOf(clientHolding([{ oidc_logout_url: 'https://sso.example.com/out' }]))).toBe(
      out
    )
  })

  it('hands back the state it generated, whatever the logout page already carries', async () => {
    const logout = await ssoLogoutUrl(
      clientHolding({ oidc_logout_url: 'https://sso.example.com/out?state=theirs' })
    )
    expect(logout?.state).toBe('fixed-state')
    expect(logout?.url).toBe(`https://sso.example.com/out?state=theirs&${RETURN}`)
  })

  it('sends the sign-up portal no state to wait for', async () => {
    expect(await ssoLogoutUrl(clientHolding({}), 'https://sign-up.example.com')).toEqual({
      url: 'https://sign-up.example.com/logout?url=twakedrive://afterlogout'
    })
  })

  it('keeps a query the logout page already carries', async () => {
    expect(
      await urlOf(clientHolding({ oidc_logout_url: 'https://sso.example.com/out?ctx=a' }))
    ).toBe(`https://sso.example.com/out?ctx=a&${RETURN}`)
  })

  it("goes to the end_session_endpoint the provider's discovery names", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ end_session_endpoint: 'https://sso.example.com/oauth2/logout' })
    })
    expect(await urlOf(clientHolding({ oidc_logout_url: 'https://sso.example.com/portal/' }))).toBe(
      `https://sso.example.com/oauth2/logout?${RETURN}`
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sso.example.com/.well-known/openid-configuration',
      expect.anything()
    )
  })

  it('does not follow an end_session_endpoint on another origin', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ end_session_endpoint: 'https://evil.example.org/logout' })
    })
    expect(await urlOf(clientHolding({ oidc_logout_url: 'https://sso.example.com/out' }))).toBe(
      `https://sso.example.com/out?${RETURN}`
    )
  })

  it('falls back to the sign-up portal when the stack names no logout page', async () => {
    expect(await urlOf(clientHolding({ attributes: {} }), 'https://sign-up.example.com')).toBe(
      'https://sign-up.example.com/logout?url=twakedrive://afterlogout'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to the sign-up portal when the settings were never loaded', async () => {
    const client = { getQueryFromState: jest.fn(() => null) } as never
    expect(await urlOf(client, 'https://sign-up.example.com')).toBe(
      'https://sign-up.example.com/logout?url=twakedrive://afterlogout'
    )
  })

  it('is nothing on an instance with neither', async () => {
    expect(await urlOf(clientHolding({}), undefined)).toBeNull()
    expect(await urlOf(null, undefined)).toBeNull()
  })
})
