import { uploadSharedFile } from './uploadSharedFile'

const mkResp = (status: number, body: unknown) => {
  const p: any = Promise.resolve({
    info: () => ({ status }),
    json: () => body
  })
  p.uploadProgress = jest.fn(() => p) // chainable, returns same thenable
  return p
}

const mockFetch = jest.fn()
jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {
    fetch: (...args: unknown[]) => mockFetch(...args),
    wrap: (path: string) => ({ __wrapped: path })
  }
}))
jest.mock('@/pouchdb/triggerReplication', () => ({ triggerPouchReplication: jest.fn() }))

const client = {
  getStackClient: () => ({ uri: 'https://alice.example', getAccessToken: () => 'tok' })
} as unknown as import('cozy-client').default

const item = { uri: 'file:///tmp/pic.jpg', name: 'pic.jpg', mimeType: 'image/jpeg' }

beforeEach(() => mockFetch.mockReset())

test('POSTs the file to the folder upload route with a bearer token', async () => {
  mockFetch.mockReturnValueOnce(
    mkResp(201, { data: { id: 'f1', attributes: { name: 'pic.jpg' } } })
  )
  const res = await uploadSharedFile(client, item, 'dir42')
  expect(res).toEqual({ _id: 'f1', name: 'pic.jpg' })
  const [method, url, headers, wrapped] = mockFetch.mock.calls[0]
  expect(method).toBe('POST')
  expect(url).toBe('https://alice.example/files/dir42?Type=file&Name=pic.jpg')
  expect(headers.Authorization).toBe('Bearer tok')
  expect(headers['Content-Type']).toBe('image/jpeg')
  expect(wrapped).toEqual({ __wrapped: '/tmp/pic.jpg' })
})

test('retries with a numeric suffix on 409 name conflict', async () => {
  mockFetch
    .mockReturnValueOnce(mkResp(409, {}))
    .mockReturnValueOnce(mkResp(201, { data: { id: 'f2', attributes: { name: 'pic (1).jpg' } } }))
  const res = await uploadSharedFile(client, item, 'dir42')
  expect(res._id).toBe('f2')
  expect(mockFetch.mock.calls[1][1]).toBe(
    'https://alice.example/files/dir42?Type=file&Name=pic%20(1).jpg'
  )
})

test('throws on a non-conflict HTTP error', async () => {
  mockFetch.mockReturnValueOnce(mkResp(507, {}))
  await expect(uploadSharedFile(client, item, 'dir42')).rejects.toThrow('HTTP 507')
})

test('reports progress and completion', async () => {
  mockFetch.mockReturnValueOnce(mkResp(201, { data: { id: 'f1' } }))
  const seen: number[] = []
  await uploadSharedFile(client, item, 'dir42', f => seen.push(f))
  expect(seen[seen.length - 1]).toBe(1)
})
