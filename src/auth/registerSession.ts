import CozyClient from 'cozy-client'

import { APP_SCOPES, APP_SCOPE_STRING, FLAGSHIP_SCOPES } from './scopes'
import { OidcCallback, Session, OAuthOptions, OAuthToken } from './types'
import { generatePkce, openAuthorizeUrl } from './pkce'
import { certificationOAuthOptions } from './storeCertification'

interface OidcResponse {
  session_code?: string
  access_token?: string
  refresh_token?: string
  token_type?: string
  scope?: string
}

const REDIRECT_URL = 'twakedrive://'

const buildOauthOptions = (): Omit<OAuthOptions, 'clientID' | 'clientSecret'> => ({
  clientName: 'Twake Drive Mobile',
  softwareID: 'twake-drive-mobile',
  redirectURI: REDIRECT_URL,
  clientKind: 'mobile',
  clientURI: 'https://twake.app',
  scopes: [...APP_SCOPES],
  ...certificationOAuthOptions()
})

interface RegisterSessionHooks {
  onAuthorizeBrowserOpen?: () => void
  onAuthorizeRedirect?: () => void
}

export const registerSession = async (
  callback: OidcCallback,
  existing?: OAuthOptions,
  hooks?: RegisterSessionHooks
): Promise<Session> => {
  const uri = `https://${callback.fqdn}`
  console.log(
    '[registerSession] init client',
    uri,
    existing?.clientID ? '(reuse client)' : '(new client)'
  )

  const client = new CozyClient({
    uri,
    oauth: existing ?? buildOauthOptions(),
    // Request the flagship scope. It sets stackClient.scope, which
    // getAuthCodeURL uses for the /auth/authorize dance below, so the token
    // minted here can ask the stack for the session codes the editors open
    // with — at the cost of the email-code certification on a first sign-in.
    scope: [...FLAGSHIP_SCOPES],
    appMetadata: { slug: 'twake-drive-mobile', version: '0.1.0' }
  } as ConstructorParameters<typeof CozyClient>[0] & { scope: string[] })

  const stackClient = client.getStackClient()
  stackClient.setUri(uri)

  if (existing?.clientID) {
    // Reuse stored registration — skip register() which throws if already
    // registered and would create a new client_id.
    stackClient.setOAuthOptions(existing)
    console.log('[registerSession] reusing existing client', existing.clientID)
  } else {
    try {
      await stackClient.register(uri)
    } catch (e) {
      console.error('[registerSession] register failed', (e as Error).message, e)
      throw e
    }
  }

  const oauthOptions = stackClient.oauthOptions as OAuthOptions
  console.log('[registerSession] oauth client ready', oauthOptions.clientID)

  let oidcResponse: OidcResponse
  try {
    // On an OIDC instance the stack replies with a session_code rather than an
    // access token; the /auth/authorize dance below exchanges it.
    oidcResponse = (await stackClient.fetchJSON('POST', '/oidc/access_token', {
      code: callback.code,
      client_id: oauthOptions.clientID,
      client_secret: oauthOptions.clientSecret,
      scope: '*'
    })) as OidcResponse
  } catch (e) {
    const msg = (e as Error).message ?? ''
    if (existing?.clientID && /must be registered|invalid_client/i.test(msg)) {
      return await registerSession(callback, undefined)
    }
    console.error('[registerSession] /oidc/access_token failed', msg, e)
    throw e
  }
  console.log('[registerSession] oidc response keys', Object.keys(oidcResponse).join(','))

  let token: OAuthToken

  if (oidcResponse.access_token) {
    token = {
      accessToken: oidcResponse.access_token,
      refreshToken: oidcResponse.refresh_token ?? '',
      tokenType: oidcResponse.token_type ?? 'bearer',
      scope: oidcResponse.scope ?? APP_SCOPE_STRING
    }
  } else if (oidcResponse.session_code) {
    console.log('[registerSession] session_code received, going through /auth/authorize')
    const pkceCodes = await generatePkce()
    console.log('[registerSession] pkce ready, challenge len', pkceCodes.codeChallenge.length)
    const authorizeResult = (await client.authorize({
      sessionCode: oidcResponse.session_code,
      pkceCodes,
      openURLCallback: async (url: string) => {
        hooks?.onAuthorizeBrowserOpen?.()
        const redirect = await openAuthorizeUrl(url)
        hooks?.onAuthorizeRedirect?.()
        return redirect
      }
    })) as { token: OAuthToken & { tokenType?: string } }
    console.log(
      '[registerSession] authorize complete, tokenLen',
      authorizeResult.token?.accessToken?.length ?? 0
    )
    token = {
      accessToken: authorizeResult.token.accessToken,
      refreshToken: authorizeResult.token.refreshToken,
      tokenType: authorizeResult.token.tokenType ?? 'bearer',
      scope: authorizeResult.token.scope ?? APP_SCOPE_STRING
    }
  } else {
    throw new Error(
      `OIDC response had neither access_token nor session_code. Keys: ${Object.keys(oidcResponse).join(',')}`
    )
  }

  return { uri, oauthOptions, token }
}
