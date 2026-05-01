import { useCallback, useEffect, useState } from 'react'
import CozyClient from 'cozy-client'

import { createClient } from '@/client/createClient'
import { clearSession, getSession, saveSession } from './tokenStorage'
import { startOidcFlow } from './oidcFlow'
import { registerSession } from './registerSession'
import { getLoginUri } from './autodiscovery'

interface UseAuthState {
  status: 'loading' | 'authenticated' | 'unauthenticated'
  client: CozyClient | null
}

export const useAuth = () => {
  const [state, setState] = useState<UseAuthState>({ status: 'loading', client: null })

  useEffect(() => {
    const bootstrap = async () => {
      const session = await getSession()
      if (!session) {
        setState({ status: 'unauthenticated', client: null })
        return
      }
      setState({ status: 'authenticated', client: createClient(session) })
    }
    void bootstrap()
  }, [])

  const login = useCallback(async (email: string): Promise<void> => {
    const loginUri = await getLoginUri(email)
    if (!loginUri) throw new Error('DOMAIN_UNSUPPORTED')

    const callback = await startOidcFlow(loginUri)
    const session = await registerSession(callback)
    await saveSession(session)

    setState({ status: 'authenticated', client: createClient(session) })
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    if (state.client) {
      try {
        await state.client.logout()
      } catch {
        // ignore — server may be unreachable
      }
    }
    await clearSession()
    setState({ status: 'unauthenticated', client: null })
  }, [state.client])

  return { ...state, login, logout }
}
