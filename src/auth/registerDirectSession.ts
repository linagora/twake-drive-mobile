import CozyClient from 'cozy-client'

import { APP_SCOPES, APP_SCOPE_STRING } from './scopes'
import { Session, OAuthOptions, OAuthToken } from './types'
import { generatePkce, openAuthorizeUrl } from './pkce'

const REDIRECT_URL = 'twakedrive://'

/**
 * Signs in against a cozy-stack instance directly, without the cloudery.
 *
 * Development only. The app's real entry points go through the Twake cloudery
 * or an organisation's OIDC discovery, and a stack spun up for testing has
 * neither — which is what keeps the e2e suite from running against a
 * disposable instance.
 *
 * The dance is the stack's own OAuth one: register a client, then hand
 * `/auth/authorize` to the system browser. The passphrase is typed on the
 * stack's own page in an external browser, never in a webview.
 */
export const registerDirectSession = async (instanceUri: string): Promise<Session> => {
  const uri = instanceUri.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//.test(uri)) throw new Error('The instance address must start with http(s)://')

  const client = new CozyClient({
    uri,
    oauth: {
      clientName: 'Twake Drive Mobile',
      softwareID: 'twake-drive-mobile',
      redirectURI: REDIRECT_URL,
      clientKind: 'mobile',
      clientURI: 'https://twake.app',
      scopes: [...APP_SCOPES]
    },
    scope: [...APP_SCOPES],
    appMetadata: { slug: 'twake-drive-mobile', version: '0.1.0' }
  } as ConstructorParameters<typeof CozyClient>[0] & { scope: string[] })

  const stackClient = client.getStackClient()
  stackClient.setUri(uri)
  await stackClient.register(uri)
  const oauthOptions = stackClient.oauthOptions as OAuthOptions

  const pkceCodes = await generatePkce()
  const authorizeResult = (await client.authorize({
    pkceCodes,
    openURLCallback: (url: string) => openAuthorizeUrl(url)
  })) as { token: OAuthToken & { tokenType?: string } }

  const token: OAuthToken = {
    accessToken: authorizeResult.token.accessToken,
    refreshToken: authorizeResult.token.refreshToken,
    tokenType: authorizeResult.token.tokenType ?? 'bearer',
    scope: authorizeResult.token.scope ?? APP_SCOPE_STRING
  }

  return { uri, oauthOptions, token }
}
