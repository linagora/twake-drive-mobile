import { NetworkError, TwakeConfiguration } from './types'

export const extractDomain = (email: string): string | null => {
  if (!email) return null
  const trimmed = email.trim()
  const atIndex = trimmed.lastIndexOf('@')
  if (atIndex === -1) return null
  const domain = trimmed.substring(atIndex + 1)
  return domain.length > 0 ? domain : null
}

/**
 * Resolves the domain's Twake configuration.
 *
 * Returns null only when the domain answered but has no usable configuration —
 * that is a genuine "this domain does not support Twake Drive". A transport
 * failure or a 5xx throws NetworkError instead, so the login screen can say
 * "check your connection" rather than blaming the user's domain.
 */
export const fetchTwakeConfiguration = async (
  domain: string
): Promise<TwakeConfiguration | null> => {
  const url = `https://${domain}/.well-known/twake-configuration`
  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
    })
  } catch (err) {
    throw new NetworkError((err as Error)?.message ?? 'discovery request failed')
  }
  if (response.status >= 500) {
    throw new NetworkError(`discovery responded ${response.status}`)
  }
  if (!response.ok) return null
  try {
    return (await response.json()) as TwakeConfiguration
  } catch {
    // Reachable but the payload is not the configuration we expect.
    return null
  }
}

const REDIRECT_SCHEME = 'twakedrive://'

// The Twake consumer sign-in / sign-up goes through the Cozy cloudery (manager),
// which orchestrates the sign-up.twake.app login (including the already-signed-in
// case) and mints the fqdn+code the app needs — the same manager the org flow
// reaches via twake-flagship-login-uri. Mirrors cozy-flagship-app's Twake cloudery
// URL. Opening sign-up.twake.app directly does not yield an OIDC code for Drive.
export const TWAKE_CLOUDERY_LOGIN_URL = 'https://manager.cozycloud.cc/linagora/twake_prod'

const buildLoginUri = (flagshipUri: string, extra?: Record<string, string>): URL | null => {
  try {
    const uri = new URL(flagshipUri)
    uri.searchParams.append('redirect_after_oidc', REDIRECT_SCHEME)
    for (const [key, value] of Object.entries(extra ?? {})) uri.searchParams.append(key, value)
    return uri
  } catch {
    return null
  }
}

export const getLoginUri = async (email: string): Promise<URL | null> => {
  const domain = extractDomain(email)
  if (!domain) return null

  const config = await fetchTwakeConfiguration(domain)
  const flagshipUri = config?.['twake-flagship-login-uri']
  return flagshipUri ? buildLoginUri(flagshipUri, { login_hint: email.trim() }) : null
}

export const getTwakeWorkplaceLoginUri = (mode: 'signin' | 'signup'): URL => {
  const uri = new URL(TWAKE_CLOUDERY_LOGIN_URL)
  uri.searchParams.append('redirect_after_oidc', REDIRECT_SCHEME)
  // The cloudery selects the register flow with `register=true`; sign-in is the
  // default. The redirect comes back as twakedrive://?fqdn=…&code=…, consumed by the
  // same parseCallbackUrl + registerSession path as the org login.
  if (mode === 'signup') uri.searchParams.append('register', 'true')
  return uri
}
