import React from 'react'
import { render } from '@testing-library/react-native'

const mockRefresh = jest.fn()
jest.mock('@/files/refreshDocument', () => ({
  __esModule: true,
  refreshDocumentFromStack: (...args: unknown[]) => mockRefresh(...args)
}))

const client = { id: 'client' }
jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => client
}))

import { EDITOR_SAVE_GRACE_MS, useRefreshOnLeave } from './useRefreshOnLeave'

const Editor = ({ fileId }: { fileId: string }) => {
  useRefreshOnLeave(fileId, 'drive-7')
  return null
}

describe('useRefreshOnLeave', () => {
  beforeEach(() => {
    mockRefresh.mockReset()
    jest.useFakeTimers()
  })
  afterEach(() => jest.useRealTimers())

  it('leaves the document alone while the editor is open', () => {
    render(<Editor fileId="f1" />)
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('reads the document back when the editor goes away, then once more', () => {
    const { unmount } = render(<Editor fileId="f1" />)
    unmount()
    expect(mockRefresh).toHaveBeenCalledWith(client, 'f1', 'drive-7')
    expect(mockRefresh).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(EDITOR_SAVE_GRACE_MS)
    expect(mockRefresh).toHaveBeenCalledTimes(2)
  })
})
