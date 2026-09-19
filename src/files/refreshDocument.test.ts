import CozyClient from 'cozy-client'

const mockTrigger = jest.fn()
jest.mock('@/pouchdb/triggerReplication', () => ({
  __esModule: true,
  triggerPouchReplication: (...args: unknown[]) => mockTrigger(...args)
}))

const mockOnline = jest.fn(() => true)
jest.mock('@/network/OnlineMonitor', () => ({
  __esModule: true,
  getOnlineMonitor: () => ({ getCurrent: () => mockOnline() })
}))

import { refreshDocumentFromStack } from './refreshDocument'

const clientWith = (statById: jest.Mock) => {
  const setData = jest.fn()
  const collection = jest.fn(() => ({ statById }))
  return {
    client: { collection, setData } as unknown as CozyClient,
    setData,
    collection
  }
}

describe('refreshDocumentFromStack', () => {
  beforeEach(() => {
    mockTrigger.mockReset()
    mockOnline.mockReturnValue(true)
  })

  it('puts the document the stack answers with into the store', async () => {
    const statById = jest.fn().mockResolvedValue({ data: { _id: 'f1', name: 'renamed.cozy-note' } })
    const { client, setData, collection } = clientWith(statById)

    await refreshDocumentFromStack(client, 'f1')

    expect(collection).toHaveBeenCalledWith('io.cozy.files', undefined)
    expect(statById).toHaveBeenCalledWith('f1')
    expect(setData).toHaveBeenCalledWith({
      'io.cozy.files': [{ _id: 'f1', name: 'renamed.cozy-note' }]
    })
    expect(mockTrigger).toHaveBeenCalledWith(client, 'io.cozy.files')
  })

  it('reads a document of a shared drive from that drive', async () => {
    const statById = jest.fn().mockResolvedValue({ data: { _id: 'f1' } })
    const { client, collection } = clientWith(statById)

    await refreshDocumentFromStack(client, 'f1', 'drive-7')

    expect(collection).toHaveBeenCalledWith('io.cozy.files', { driveId: 'drive-7' })
  })

  it('still asks the replication to catch up when the stack call fails', async () => {
    const statById = jest.fn().mockRejectedValue(new Error('HTTP 500'))
    const { client, setData } = clientWith(statById)

    await refreshDocumentFromStack(client, 'f1')

    expect(setData).not.toHaveBeenCalled()
    expect(mockTrigger).toHaveBeenCalledTimes(1)
  })

  it('does nothing offline, where the call could only fail', async () => {
    mockOnline.mockReturnValue(false)
    const statById = jest.fn()
    const { client } = clientWith(statById)

    await refreshDocumentFromStack(client, 'f1')

    expect(statById).not.toHaveBeenCalled()
    expect(mockTrigger).not.toHaveBeenCalled()
  })
})
