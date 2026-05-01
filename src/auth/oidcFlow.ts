import * as WebBrowser from 'expo-web-browser'

import { OidcCallback, UserCancelledError } from './types'

export const parseCallbackUrl = (callbackUrl: string): OidcCallback => {
  const url = new URL(callbackUrl)
  const fqdn = url.searchParams.get('fqdn')
  const registerToken = url.searchParams.get('registerToken')
  const code = url.searchParams.get('code')

  if (!fqdn) throw new Error('Callback URL missing fqdn')
  if (!registerToken) throw new Error('Callback URL missing registerToken')

  return { fqdn, registerToken, code }
}

export const startOidcFlow = async (loginUri: URL): Promise<OidcCallback> => {
  const result = await WebBrowser.openAuthSessionAsync(loginUri.toString(), 'twakedrive://')
  if (result.type !== 'success') throw new UserCancelledError()
  return parseCallbackUrl(result.url)
}
