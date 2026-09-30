const mockEnsure = jest.fn(async () => undefined)
const mockRemove = jest.fn(async () => undefined)

jest.mock('react-native', () => ({
  NativeModules: {
    TwakeFileProviderDomain: {
      ensure: () => mockEnsure(),
      remove: () => mockRemove()
    }
  },
  Platform: { OS: 'ios' }
}))

import { ensureFileProviderDomain, removeFileProviderDomain } from './fileProviderDomain'

beforeEach(() => jest.clearAllMocks())

test('shows the Files entry through the native module', async () => {
  await ensureFileProviderDomain()
  expect(mockEnsure).toHaveBeenCalledTimes(1)
})

test('takes the Files entry down through the native module', async () => {
  await removeFileProviderDomain()
  expect(mockRemove).toHaveBeenCalledTimes(1)
})

test('a native failure does not reach the caller', async () => {
  mockRemove.mockRejectedValueOnce(new Error('domain busy'))
  await expect(removeFileProviderDomain()).resolves.toBeUndefined()
})
