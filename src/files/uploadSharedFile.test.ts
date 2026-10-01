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
const mockGetInfo = jest.fn()
jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: (...args: unknown[]) => mockGetInfo(...args)
}))
jest.mock('@/pouchdb/triggerReplication', () => ({ triggerPouchReplication: jest.fn() }))

const client = {
  getStackClient: () => ({ uri: 'https://alice.example', getAccessToken: () => 'tok' })
} as unknown as import('cozy-client').default

const item = { uri: 'file:///tmp/pic.jpg', name: 'pic.jpg', mimeType: 'image/jpeg' }

beforeEach(() => {
  mockFetch.mockReset()
  mockGetInfo.mockReset()
  mockGetInfo.mockResolvedValue({ exists: true, size: 10 })
})

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

const contentItem = {
  uri: 'content://media/external/images/media/42',
  name: 'a.jpg',
  mimeType: 'image/jpeg',
  size: 20000
}

test('hands a content:// uri to the uploader as it is', async () => {
  mockFetch.mockReturnValueOnce(mkResp(201, { data: { id: 'f1' } }))
  await uploadSharedFile(client, contentItem, 'dir42')
  expect(mockGetInfo).toHaveBeenCalledWith(contentItem.uri)
  expect(mockFetch.mock.calls[0][3]).toEqual({ __wrapped: contentItem.uri })
})

test('does not judge a content:// uri by the size its stream reports', async () => {
  mockGetInfo.mockResolvedValue({ exists: true, size: 0 })
  mockFetch.mockReturnValueOnce(mkResp(201, { data: { id: 'f1' } }))
  await uploadSharedFile(client, contentItem, 'dir42')
  expect(mockFetch).toHaveBeenCalledTimes(1)
})

test('inspects the file before sending it', async () => {
  mockFetch.mockReturnValueOnce(mkResp(201, { data: { id: 'f1' } }))
  await uploadSharedFile(client, item, 'dir42')
  expect(mockGetInfo).toHaveBeenCalledWith('file:///tmp/pic.jpg')
})

test('sends nothing when the file is missing', async () => {
  mockGetInfo.mockResolvedValue({ exists: false })
  await expect(uploadSharedFile(client, item, 'dir42')).rejects.toThrow('not readable')
  expect(mockFetch).not.toHaveBeenCalled()
})

test('sends nothing when the file cannot be inspected', async () => {
  mockGetInfo.mockRejectedValue(new Error('EACCES (Permission denied)'))
  await expect(uploadSharedFile(client, item, 'dir42')).rejects.toThrow('not readable')
  expect(mockFetch).not.toHaveBeenCalled()
})

test('sends nothing when the file reads as empty while a size was announced', async () => {
  mockGetInfo.mockResolvedValue({ exists: true, size: 0 })
  await expect(uploadSharedFile(client, { ...item, size: 2048 }, 'dir42')).rejects.toThrow(
    'not readable'
  )
  expect(mockFetch).not.toHaveBeenCalled()
})

test('uploads a file that is genuinely empty', async () => {
  mockGetInfo.mockResolvedValue({ exists: true, size: 0 })
  mockFetch.mockReturnValueOnce(mkResp(201, { data: { id: 'f1' } }))
  await uploadSharedFile(client, { ...item, size: 0 }, 'dir42')
  expect(mockFetch).toHaveBeenCalledTimes(1)
})
