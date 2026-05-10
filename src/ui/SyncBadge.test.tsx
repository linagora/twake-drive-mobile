import React from 'react'
import { render } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'

import { SyncContext, SyncContextValue } from '@/sync/SyncContext'
import { SyncBadge } from './SyncBadge'

const wrap = (value: Partial<SyncContextValue>) => {
  const full: SyncContextValue = {
    status: 'idle',
    lastSyncedAt: null,
    error: null,
    triggerSync: () => undefined,
    ...value
  }
  return render(
    <PaperProvider>
      <SyncContext.Provider value={full}>
        <SyncBadge />
      </SyncContext.Provider>
    </PaperProvider>
  )
}

describe('SyncBadge', () => {
  it('renders nothing when idle', () => {
    const { queryByTestId } = wrap({ status: 'idle' })
    expect(queryByTestId('sync-badge')).toBeNull()
  })

  it('renders a spinner when syncing', () => {
    const { getByTestId } = wrap({ status: 'syncing' })
    expect(getByTestId('sync-badge-syncing')).toBeTruthy()
  })

  it('renders a cloud-off icon when offline', () => {
    const { getByTestId } = wrap({ status: 'offline' })
    expect(getByTestId('sync-badge-offline')).toBeTruthy()
  })

  it('renders an alert icon when error', () => {
    const { getByTestId } = wrap({ status: 'error' })
    expect(getByTestId('sync-badge-error')).toBeTruthy()
  })
})
