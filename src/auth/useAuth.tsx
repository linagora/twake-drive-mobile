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
