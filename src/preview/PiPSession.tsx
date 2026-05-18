import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

import type { StreamSource } from '@/files/streamUrl'

export interface PiPSessionState {
  fileId: string
  source: StreamSource
}

export interface PiPSessionContextValue {
  active: PiPSessionState | null
  claim: (fileId: string, source: StreamSource) => void
  release: () => void
}

const PiPSessionContext = createContext<PiPSessionContextValue | null>(null)

export const PiPSessionProvider = ({ children }: { children: React.ReactNode }) => {
  const [active, setActive] = useState<PiPSessionState | null>(null)

  const claim = useCallback((fileId: string, source: StreamSource): void => {
    setActive({ fileId, source })
  }, [])

  const release = useCallback((): void => {
    setActive(null)
  }, [])

  const value = useMemo(() => ({ active, claim, release }), [active, claim, release])

  return <PiPSessionContext.Provider value={value}>{children}</PiPSessionContext.Provider>
}

export const usePiPSession = (): PiPSessionContextValue => {
  const ctx = useContext(PiPSessionContext)
  if (!ctx) throw new Error('usePiPSession must be used inside <PiPSessionProvider>')
  return ctx
}
