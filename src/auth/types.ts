export interface TwakeConfiguration {
  'twake-pass-login-uri'?: string
  'twake-flagship-login-uri'?: string
}

export interface OidcCallback {
  fqdn: string
  code: string
  defaultRedirection: string | null
}

export interface OAuthOptions {
  clientID: string
  clientSecret: string
  clientName: string
  softwareID: string
  redirectURI: string
  clientKind: string
  clientURI: string
  scopes: string[]
  registrationAccessToken?: string
}

export interface OAuthToken {
  accessToken: string
  refreshToken: string
  tokenType: string
  scope: string
}

export interface Session {
  uri: string
  oauthOptions: OAuthOptions
  token: OAuthToken
}

export class UserCancelledError extends Error {
  constructor() {
    super('User cancelled OIDC flow')
    this.name = 'UserCancelledError'
  }
}

export class DiscoveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiscoveryError'
  }
}

/**
 * The server could not be reached (or answered 5xx) while resolving the
 * instance. Distinct from "this domain has no Twake configuration": the login
 * screen must offer a retry rather than tell the user their domain is
 * unsupported.
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NetworkError'
  }
}
