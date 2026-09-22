import flag from 'cozy-flags'

import { flagsFromDoc, refreshFlags } from './refreshFlags'

let mockOnline = true
jest.mock('@/network/OnlineMonitor', () => ({
  getOnlineMonitor: () => ({ getCurrent: () => mockOnline })
}))

describe('flagsFromDoc', () => {
  it('reads the flags the stack puts under attributes', () => {
    expect(flagsFromDoc({ attributes: { 'drive.onlyoffice.enabled': true } })).toEqual({
      'drive.onlyoffice.enabled': true
    })
  })

  it('reads the flags a document from the local replica carries at its root', () => {
    expect(
      flagsFromDoc({
        _id: 'io.cozy.settings.flags',
        _rev: '4-abc',
        _type: 'io.cozy.settings',
        cozyMetadata: { doctypeVersion: '1' },
        'drive.onlyoffice.enabled': true,
        'drive.excalidraw.enabled': false
      })
    ).toEqual({ 'drive.onlyoffice.enabled': true, 'drive.excalidraw.enabled': false })
  })

  it('answers nothing for a document that is not there', () => {
    expect(flagsFromDoc(null)).toEqual({})
  })
})

describe('refreshFlags', () => {
  beforeEach(() => {
    mockOnline = true
    flag('drive.onlyoffice.enabled', null)
  })

  it('enables what a flattened document holds', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({
        data: { _id: 'io.cozy.settings.flags', 'drive.onlyoffice.enabled': true }
      })
    }
    await refreshFlags(client as never)
    expect(flag('drive.onlyoffice.enabled')).toBe(true)
  })

  it('leaves the flags in place rather than turning features off when offline', async () => {
    flag('drive.onlyoffice.enabled', true)
    mockOnline = false
    const client = { query: jest.fn() }
    await refreshFlags(client as never)
    expect(client.query).not.toHaveBeenCalled()
    expect(flag('drive.onlyoffice.enabled')).toBe(true)
  })
})
