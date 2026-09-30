import type CozyClient from 'cozy-client'

import { getSession } from './tokenStorage'

interface StackClientWithToken {
  token?: { accessToken?: string }
  setToken?: (token: unknown) => void
}

/**
 * Take on the token the keychain holds, when it is not the one in hand.
 *
 * The File Provider extension refreshes on its own while the app is away, and
 * the stack hands it a rotated refresh token which it stores in the shared
 * keychain. The app keeps its own copy in memory, so the one it presents next
 * has been spent, and the answer to that is indistinguishable from a session
 * somebody ended.
 *
 * Answers whether a different token was adopted.
 */
export const adoptStoredToken = async (client: CozyClient | null | undefined): Promise<boolean> => {
  if (!client) return false
  const stack = (
    client as unknown as { getStackClient?: () => StackClientWithToken | undefined }
  ).getStackClient?.()
  if (!stack?.setToken) return false
  const stored = await getSession()
  const access = stored?.token?.accessToken
  if (!access) return false
  if (stack.token?.accessToken === access) return false
  stack.setToken(stored.token)
  return true
}
