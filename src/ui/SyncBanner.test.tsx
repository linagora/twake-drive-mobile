import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { act, render, screen } from '@testing-library/react-native'

let mockOnline = true
jest.mock('@/network/useIsOnline', () => ({ useIsOnline: () => mockOnline }))

const handlers: Record<string, () => void> = {}
jest.mock('@/client/cozyClientInternals', () => ({
  clientEmitter: () => ({
    on: (name: string, handler: () => void) => {
      handlers[name] = handler
    },
    removeListener: jest.fn()
  })
}))

jest.mock('cozy-client', () => ({ useClient: () => ({}) }))

import { SyncBanner } from './SyncBanner'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('SyncBanner', () => {
  afterEach(() => {
    mockOnline = true
  })

  it('stays hidden until a sync starts', () => {
    render(wrap(<SyncBanner />))
    expect(screen.queryByTestId('sync-progress')).toBeNull()
  })

  it('shows the bar while a sync is running', () => {
    render(wrap(<SyncBanner />))
    act(() => handlers['pouchlink:sync:start']())
    expect(screen.getByTestId('sync-progress')).toBeOnTheScreen()
  })

  it('hides the bar once the sync ends', () => {
    render(wrap(<SyncBanner />))
    act(() => handlers['pouchlink:sync:start']())
    act(() => handlers['pouchlink:sync:end']())
    expect(screen.queryByTestId('sync-progress')).toBeNull()
  })

  // Going offline stops the replication loop without any link-level event, so
  // the last sync:start would otherwise leave the bar spinning for good.
  it('hides the bar while the device is offline', () => {
    render(wrap(<SyncBanner />))
    act(() => handlers['pouchlink:sync:start']())
    mockOnline = false
    screen.rerender(wrap(<SyncBanner />))
    expect(screen.queryByTestId('sync-progress')).toBeNull()
  })
})
