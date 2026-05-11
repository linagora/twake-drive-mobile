import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import CozyClient from 'cozy-client'

import { createClient } from '@/client/createClient'
import { clearSession, getSession, saveSession } from './tokenStorage'
import { startOidcFlow } from './oidcFlow'
import { registerSession } from './registerSession'
import { getLoginUri } from './autodiscovery'

interface AuthState {
  status: 'loading' | 'authenticated' | 'unauthenticated'
  client: CozyClient | null
}

interface AuthContextValue extends AuthState {
  login: (email: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<AuthState>({ status: 'loading', client: null })

  useEffect(() => {
    const bootstrap = async () => {
      const session = await getSession()
      if (!session) {
        setState({ status: 'unauthenticated', client: null })
        return
      }
      try {
        const client = await createClient(session)
        setState({ status: 'authenticated', client })
      } catch (err) {
        console.warn('[useAuth] createClient failed on bootstrap', err)
        setState({ status: 'unauthenticated', client: null })
      }
    }
    void bootstrap()
  }, [])

  const login = useCallback(async (email: string): Promise<void> => {
    console.log('[useAuth] login start', email)
    const loginUri = await getLoginUri(email)
    console.log('[useAuth] loginUri', loginUri?.toString() ?? 'null')
    if (!loginUri) throw new Error('DOMAIN_UNSUPPORTED')

    const callback = await startOidcFlow(loginUri)
    console.log('[useAuth] oidc callback', JSON.stringify(callback))
    const session = await registerSession(callback)
    console.log('[useAuth] session built for', session.uri)
    await saveSession(session)
    console.log('[useAuth] session saved, transitioning to authenticated')

    const client = await createClient(session)
    setState({ status: 'authenticated', client })
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    setState(prev => {
      if (prev.client) {
        Promise.resolve(prev.client.logout()).catch(() => {
          // ignore — server may be unreachable
        })
      }
      return prev
    })
    await clearSession()
    setState({ status: 'unauthenticated', client: null })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout }),
    [state, login, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider')
  return ctx
}
