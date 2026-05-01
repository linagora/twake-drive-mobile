import * as WebBrowser from 'expo-web-browser'

import { parseCallbackUrl, startOidcFlow } from './oidcFlow'
import { UserCancelledError } from './types'

describe('parseCallbackUrl', () => {
  it('extracts fqdn and registerToken from a callback URL', () => {
    const url = 'twakedrive://?fqdn=alice.example.com&registerToken=abc123'
    expect(parseCallbackUrl(url)).toEqual({
      fqdn: 'alice.example.com',
      registerToken: 'abc123',
      code: null
    })
  })

  it('extracts code when present', () => {
    const url = 'twakedrive://?fqdn=alice.example.com&registerToken=abc&code=xyz'
    expect(parseCallbackUrl(url)).toEqual({
      fqdn: 'alice.example.com',
      registerToken: 'abc',
      code: 'xyz'
    })
  })

  it('throws when fqdn is missing', () => {
    expect(() => parseCallbackUrl('twakedrive://?registerToken=abc')).toThrow(/fqdn/)
  })

  it('throws when registerToken is missing', () => {
    expect(() => parseCallbackUrl('twakedrive://?fqdn=alice.example.com')).toThrow(/registerToken/)
  })

  it('throws on a malformed URL', () => {
    expect(() => parseCallbackUrl('not a url')).toThrow()
  })
})

describe('startOidcFlow', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns parsed callback on success', async () => {
    ;(WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({
      type: 'success',
      url: 'twakedrive://?fqdn=alice.example.com&registerToken=abc'
    })
    const result = await startOidcFlow(new URL('https://login.example.com/oauth'))
    expect(result).toEqual({ fqdn: 'alice.example.com', registerToken: 'abc', code: null })
  })

  it('throws UserCancelledError when result type is cancel', async () => {
    ;(WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({ type: 'cancel' })
    await expect(startOidcFlow(new URL('https://login.example.com/oauth'))).rejects.toBeInstanceOf(
      UserCancelledError
    )
  })

  it('throws UserCancelledError when result type is dismiss', async () => {
    ;(WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({ type: 'dismiss' })
    await expect(startOidcFlow(new URL('https://login.example.com/oauth'))).rejects.toBeInstanceOf(
      UserCancelledError
    )
  })
})
