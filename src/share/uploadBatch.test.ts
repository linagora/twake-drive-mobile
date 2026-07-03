import { uploadBatch } from './uploadBatch'
import { uploadSharedFile } from '@/files/uploadSharedFile'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'

jest.mock('@/files/uploadSharedFile', () => ({ uploadSharedFile: jest.fn() }))
jest.mock('@/pouchdb/triggerReplication', () => ({ triggerPouchReplication: jest.fn() }))

const client = {} as unknown as import('cozy-client').default
const items = [
  { uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' },
  { uri: 'file:///b.jpg', name: 'b.jpg', mimeType: 'image/jpeg' }
]

beforeEach(() => {
  ;(uploadSharedFile as jest.Mock).mockReset()
  ;(triggerPouchReplication as jest.Mock).mockReset()
})

test('uploads every item and triggers replication once on success', async () => {
  ;(uploadSharedFile as jest.Mock)
    .mockResolvedValueOnce({ _id: 'a', name: 'a.jpg' })
    .mockResolvedValueOnce({ _id: 'b', name: 'b.jpg' })
  const res = await uploadBatch(client, items, 'dir1')
  expect(res.succeeded).toBe(2)
  expect(res.failed).toBe(0)
  expect(triggerPouchReplication).toHaveBeenCalledTimes(1)
})

test('records partial failures without aborting the batch', async () => {
  ;(uploadSharedFile as jest.Mock)
    .mockRejectedValueOnce(new Error('boom'))
    .mockResolvedValueOnce({ _id: 'b', name: 'b.jpg' })
  const res = await uploadBatch(client, items, 'dir1')
  expect(res.succeeded).toBe(1)
  expect(res.failed).toBe(1)
  expect(res.results[0]).toMatchObject({ ok: false, error: 'boom' })
  expect(res.results[1]).toMatchObject({ ok: true })
  expect(triggerPouchReplication).toHaveBeenCalledTimes(1) // ≥1 success
})

test('does not trigger replication when everything fails', async () => {
  ;(uploadSharedFile as jest.Mock).mockRejectedValue(new Error('x'))
  const res = await uploadBatch(client, items, 'dir1')
  expect(res.succeeded).toBe(0)
  expect(triggerPouchReplication).not.toHaveBeenCalled()
})
