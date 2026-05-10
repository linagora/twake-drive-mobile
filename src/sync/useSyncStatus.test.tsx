import React from 'react'
import { renderHook } from '@testing-library/react-native'

import { SyncContext } from './SyncContext'
import { useSyncStatus } from './useSyncStatus'

describe('useSyncStatus', () => {
  it('returns the default value outside a provider', () => {
    const { result } = renderHook(() => useSyncStatus())
    expect(result.current.status).toBe('idle')
    expect(result.current.lastSyncedAt).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('returns the provider value when wrapped', () => {
    const value = {
      status: 'syncing' as const,
      lastSyncedAt: new Date('2026-05-10T12:00:00Z'),
      error: null,
      triggerSync: () => undefined
    }
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
    )
    const { result } = renderHook(() => useSyncStatus(), { wrapper })
    expect(result.current.status).toBe('syncing')
    expect(result.current.lastSyncedAt?.toISOString()).toBe('2026-05-10T12:00:00.000Z')
  })
})
