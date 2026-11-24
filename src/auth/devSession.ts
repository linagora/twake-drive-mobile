import { Session } from './types'

/**
 * Reads the session an end-to-end run hands the app in a link, as base64url
 * JSON. The run mints the OAuth client and its tokens on the stack itself, so
 * a flow that only needs to be signed in again skips the browser sign-in.
 *
 * It travels in the path, not a query: any `twakedrive:` link with a query is
 * taken for an OAuth callback (+native-intent.ts) and sent to the drive.
 */
export const decodeDevSession = (payload: string): Session => {
  const unpadded = payload.replace(/-/g, '+').replace(/_/g, '/')
  const base64 = unpadded.padEnd(Math.ceil(unpadded.length / 4) * 4, '=')
  const session = JSON.parse(atob(base64)) as Partial<Session>
  if (
    !session.uri ||
    !session.oauthOptions?.clientID ||
    !session.oauthOptions.clientSecret ||
    !session.token?.accessToken ||
    !session.token.refreshToken
  ) {
    throw new Error('The link does not carry a complete session')
  }
  return session as Session
}
