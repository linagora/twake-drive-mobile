import type CozyClient from 'cozy-client'

import { clientEmitter } from '@/client/cozyClientInternals'

import { getSession, saveSession } from './tokenStorage'
import { OAuthToken } from './types'

interface StackToken {
  accessToken?: string
  refreshToken?: string
  tokenType?: string
  scope?: string
}

const currentToken = (client: CozyClient): StackToken | null => {
  const stack = (client as unknown as { getStackClient?: () => { token?: StackToken } })
    .getStackClient
  return stack?.call(client)?.token ?? null
}

const merge = (stored: OAuthToken, fresh: StackToken): OAuthToken => ({
  accessToken: fresh.accessToken ?? stored.accessToken,
  refreshToken: fresh.refreshToken || stored.refreshToken,
  tokenType: fresh.tokenType || stored.tokenType,
  scope: fresh.scope || stored.scope
})

const storeCurrentToken = async (client: CozyClient): Promise<void> => {
  const fresh = currentToken(client)
  if (!fresh?.accessToken) return
  const session = await getSession()
  if (!session) return
  const token = merge(session.token, fresh)
  if (
    token.accessToken === session.token.accessToken &&
    token.refreshToken === session.token.refreshToken
  ) {
    return
  }
  await saveSession({ ...session, token })
}

/**
 * Keeps the stored session's token in step with the one cozy-client holds:
 * every refresh is written back to the keychain. Returns a function that
 * stops listening.
 */
export const keepStoredTokenFresh = (client: CozyClient): (() => void) => {
  const emitter = clientEmitter(client)
  const onRefresh = (): void => {
    void storeCurrentToken(client).catch(err =>
      console.warn('[keepStoredTokenFresh] could not store the refreshed token', err)
    )
  }
  emitter.on('tokenRefreshed', onRefresh)
  return () => emitter.removeListener('tokenRefreshed', onRefresh)
}
